import {
  applyDecorators,
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { ConsultationType, Patient, Prisma } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from "class-validator";
import { ownedPatient } from "../common/access";
import { AuthUser, CurrentUser } from "../common/auth.decorators";
import { dateFromString, num } from "../common/dates";
import { Roles } from "../common/roles";
import { ageFrom, anthropometry } from "../nutrition/calc";
import { PrismaService } from "../prisma/prisma.service";

// Medida numérica opcional dentro de un rango razonable.
const m = (min: number, max: number) => applyDecorators(IsOptional(), Type(() => Number), IsNumber(), Min(min), Max(max));
const text = (max = 4000) => applyDecorators(IsOptional(), IsString(), MaxLength(max));

export class ConsultationDto {
  @IsOptional() @IsEnum(ConsultationType) type?: ConsultationType;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "La fecha debe tener formato YYYY-MM-DD" }) date?: string;
  @IsOptional() @IsUUID() appointmentId?: string;
  @text(1000) reason?: string;

  @m(1, 400) weightKg?: number | null;
  @m(30, 250) heightCm?: number | null;
  @m(20, 250) waistCm?: number | null;
  @m(20, 250) hipCm?: number | null;
  @m(5, 80) armCm?: number | null;
  @m(5, 80) calfCm?: number | null;
  @m(5, 80) neckCm?: number | null;
  @m(1, 75) bodyFatPct?: number | null;
  @m(1, 150) muscleMassKg?: number | null;
  @m(1, 60) visceralFat?: number | null;
  @IsOptional() @IsObject() extraMeasures?: Record<string, number>;
  @IsOptional() @IsInt() @Min(50) @Max(260) systolicBp?: number | null;
  @IsOptional() @IsInt() @Min(30) @Max(160) diastolicBp?: number | null;

  @text() clinicalFindings?: string;
  @text() diagnosis?: string;
  @text() symptoms?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) adherencePct?: number | null;
  @text() treatmentChanges?: string;
  @text() notes?: string;
  @text() nextSteps?: string;
}

@Injectable()
export class ConsultationsService {
  constructor(private readonly prisma: PrismaService) {}

  async owned(nutritionistId: string, id: string) {
    const consultation = await this.prisma.consultation.findFirst({
      where: { id, nutritionistId },
      include: { patient: true },
    });
    if (!consultation) throw new NotFoundException("Consulta no encontrada");
    return consultation;
  }

  // Consulta con sus indicadores calculados y comparación con la anterior.
  async detail(nutritionistId: string, id: string) {
    const consultation = await this.owned(nutritionistId, id);
    const { patient } = consultation;
    const [previous, first] = await Promise.all([
      this.prisma.consultation.findFirst({
        where: {
          patientId: patient.id,
          id: { not: id },
          OR: [{ date: { lt: consultation.date } }, { date: consultation.date, createdAt: { lt: consultation.createdAt } }],
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      }),
      this.prisma.consultation.findFirst({
        where: { patientId: patient.id, weightKg: { not: null } },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        select: { id: true, weightKg: true },
      }),
    ]);
    // En la primera consulta no hay cambio desde el inicio que mostrar.
    const initialWeight = first && first.id !== id ? num(first.weightKg) : null;

    return {
      ...consultation,
      patient: { id: patient.id, firstName: patient.firstName, lastName: patient.lastName, sex: patient.sex },
      ageYears: ageFrom(patient.birthDate, consultation.date),
      indicators: this.indicators(patient, consultation, num(previous?.weightKg), initialWeight),
      previous,
      mealPlans: await this.prisma.mealPlan.findMany({
        where: { consultationId: id },
        select: { id: true, title: true, status: true, targetKcal: true },
      }),
    };
  }

  indicators(
    patient: Patient,
    c: Prisma.ConsultationGetPayload<object>,
    previousWeight: number | null,
    initialWeight: number | null,
  ) {
    return anthropometry({
      sex: patient.sex,
      ageYears: ageFrom(patient.birthDate, c.date),
      weightKg: num(c.weightKg),
      heightCm: num(c.heightCm),
      waistCm: num(c.waistCm),
      hipCm: num(c.hipCm),
      bodyFatPct: num(c.bodyFatPct),
      previousWeightKg: previousWeight,
      initialWeightKg: initialWeight,
    });
  }

  async create(nutritionistId: string, patientId: string, dto: ConsultationDto) {
    await ownedPatient(this.prisma, nutritionistId, patientId);
    const count = await this.prisma.consultation.count({ where: { patientId } });
    const type = dto.type ?? (count === 0 ? ConsultationType.INITIAL : ConsultationType.FOLLOW_UP);

    // Si no se indica, la talla se toma de la última consulta (en adultos casi no cambia).
    let heightCm = dto.heightCm;
    if (heightCm === undefined) {
      const last = await this.prisma.consultation.findFirst({
        where: { patientId, heightCm: { not: null } },
        orderBy: { date: "desc" },
        select: { heightCm: true },
      });
      heightCm = num(last?.heightCm);
    }

    if (dto.appointmentId) {
      const appointment = await this.prisma.appointment.findFirst({
        where: { id: dto.appointmentId, nutritionistId, patientId },
        include: { consultation: { select: { id: true } } },
      });
      if (!appointment) throw new BadRequestException("La cita no corresponde a este paciente");
      if (appointment.consultation) throw new BadRequestException("Esa cita ya tiene una consulta registrada");
    }

    return this.prisma.$transaction(async (tx) => {
      const consultation = await tx.consultation.create({
        data: {
          ...dto,
          heightCm,
          type,
          date: dto.date ? dateFromString(dto.date) : dateFromString(new Date().toISOString().slice(0, 10)),
          nutritionistId,
          patientId,
        },
      });
      if (dto.appointmentId) {
        await tx.appointment.update({ where: { id: dto.appointmentId }, data: { status: "COMPLETED" } });
      }
      return consultation;
    });
  }

  async update(nutritionistId: string, id: string, dto: ConsultationDto) {
    await this.owned(nutritionistId, id);
    const { appointmentId: _ignored, ...data } = dto;
    return this.prisma.consultation.update({
      where: { id },
      data: { ...data, date: dto.date ? dateFromString(dto.date) : undefined },
    });
  }

  async remove(nutritionistId: string, id: string) {
    await this.owned(nutritionistId, id);
    await this.prisma.consultation.delete({ where: { id } });
  }
}

@Controller()
@Roles("NUTRITIONIST")
export class ConsultationsController {
  constructor(
    private readonly consultations: ConsultationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("patients/:patientId/consultations")
  async list(@CurrentUser() user: AuthUser, @Param("patientId", ParseUUIDPipe) patientId: string) {
    await ownedPatient(this.prisma, user.id, patientId);
    return this.prisma.consultation.findMany({
      where: { patientId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
  }

  @Post("patients/:patientId/consultations")
  create(@CurrentUser() user: AuthUser, @Param("patientId", ParseUUIDPipe) patientId: string, @Body() dto: ConsultationDto) {
    return this.consultations.create(user.id, patientId, dto);
  }

  @Get("consultations/:id")
  get(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.consultations.detail(user.id, id);
  }

  @Patch("consultations/:id")
  update(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ConsultationDto) {
    return this.consultations.update(user.id, id, dto);
  }

  @Delete("consultations/:id")
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.consultations.remove(user.id, id);
  }
}
