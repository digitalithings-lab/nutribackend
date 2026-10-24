import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { AppointmentStatus, AppointmentType } from "@prisma/client";
import { IsEnum, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import { ownedPatient } from "../common/access";
import { AuthUser, CurrentUser } from "../common/auth.decorators";
import { Roles } from "../common/roles";
import { PrismaService } from "../prisma/prisma.service";

export class AppointmentDto {
  @IsUUID() patientId: string;
  @IsISO8601({}, { message: "La fecha y hora no son válidas" }) startsAt: string;
  @IsOptional() @IsInt() @Min(10) @Max(240) durationMinutes?: number;
  @IsOptional() @IsEnum(AppointmentType) type?: AppointmentType;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class UpdateAppointmentDto {
  @IsOptional() @IsISO8601({}, { message: "La fecha y hora no son válidas" }) startsAt?: string;
  @IsOptional() @IsInt() @Min(10) @Max(240) durationMinutes?: number;
  @IsOptional() @IsEnum(AppointmentType) type?: AppointmentType;
  @IsOptional() @IsEnum(AppointmentStatus) status?: AppointmentStatus;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

const MAX_RANGE_DAYS = 62;

@Controller("appointments")
@Roles("NUTRITIONIST")
export class AppointmentsController {
  constructor(private readonly prisma: PrismaService) {}

  // Citas entre dos fechas (ISO). Por defecto, los próximos 7 días.
  @Get()
  list(@CurrentUser() user: AuthUser, @Query("from") from?: string, @Query("to") to?: string) {
    const start = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
    const end = to ? new Date(to) : new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new BadRequestException("El rango de fechas no es válido");
    }
    if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
      throw new BadRequestException(`El rango no puede pasar de ${MAX_RANGE_DAYS} días`);
    }
    return this.prisma.appointment.findMany({
      where: { nutritionistId: user.id, startsAt: { gte: start, lt: end } },
      orderBy: { startsAt: "asc" },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        consultation: { select: { id: true } },
      },
    });
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: AppointmentDto) {
    const patient = await ownedPatient(this.prisma, user.id, dto.patientId);
    if (patient.archivedAt) throw new BadRequestException("El paciente está archivado");
    const startsAt = new Date(dto.startsAt);
    await this.assertNoOverlap(user.id, startsAt, dto.durationMinutes ?? 45);
    return this.prisma.appointment.create({
      data: { ...dto, startsAt, nutritionistId: user.id },
      include: { patient: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  @Patch(":id")
  async update(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateAppointmentDto) {
    const current = await this.owned(user.id, id);
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : undefined;
    if (startsAt || dto.durationMinutes) {
      await this.assertNoOverlap(user.id, startsAt ?? current.startsAt, dto.durationMinutes ?? current.durationMinutes, id);
    }
    return this.prisma.appointment.update({
      where: { id },
      data: { ...dto, startsAt },
      include: { patient: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.owned(user.id, id);
    await this.prisma.appointment.delete({ where: { id } });
  }

  private async owned(nutritionistId: string, id: string) {
    const appointment = await this.prisma.appointment.findFirst({ where: { id, nutritionistId } });
    if (!appointment) throw new NotFoundException("Cita no encontrada");
    return appointment;
  }

  // Evita dos citas a la misma hora.
  private async assertNoOverlap(nutritionistId: string, startsAt: Date, minutes: number, exceptId?: string) {
    const endsAt = new Date(startsAt.getTime() + minutes * 60_000);
    const sameDay = await this.prisma.appointment.findMany({
      where: {
        nutritionistId,
        status: "SCHEDULED",
        id: exceptId ? { not: exceptId } : undefined,
        startsAt: { gte: new Date(startsAt.getTime() - 24 * 60 * 60 * 1000), lt: endsAt },
      },
      include: { patient: { select: { firstName: true, lastName: true } } },
    });
    const clash = sameDay.find((a) => a.startsAt.getTime() + a.durationMinutes * 60_000 > startsAt.getTime());
    if (clash) {
      throw new BadRequestException(`Ya tienes una cita a esa hora con ${clash.patient.firstName} ${clash.patient.lastName}`);
    }
  }
}
