import { Injectable, NotFoundException } from "@nestjs/common";
import { assertCanAddPatient, ownedPatient } from "../common/access";
import { dateFromString, num } from "../common/dates";
import { ageFrom, anthropometry, round } from "../nutrition/calc";
import { PrismaService } from "../prisma/prisma.service";
import {
  BackgroundDto,
  DietHistoryDto,
  LabResultDto,
  MedicationDto,
  PatientDto,
  UpdatePatientDto,
} from "./patients.dto";

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(nutritionistId: string, search?: string, archived = false) {
    const words = (search ?? "").trim().split(/\s+/).filter(Boolean);
    const patients = await this.prisma.patient.findMany({
      where: {
        nutritionistId,
        archivedAt: archived ? { not: null } : null,
        AND: words.map((word) => ({
          OR: [
            { firstName: { contains: word, mode: "insensitive" as const } },
            { lastName: { contains: word, mode: "insensitive" as const } },
            { documentId: { contains: word, mode: "insensitive" as const } },
            { email: { contains: word, mode: "insensitive" as const } },
          ],
        })),
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      include: {
        consultations: { orderBy: { date: "desc" }, take: 1, select: { date: true, weightKg: true, heightCm: true } },
        appointments: {
          where: { startsAt: { gte: new Date() }, status: "SCHEDULED" },
          orderBy: { startsAt: "asc" },
          take: 1,
          select: { startsAt: true },
        },
        mealPlans: { where: { status: "APPROVED" }, orderBy: { approvedAt: "desc" }, take: 1, select: { targetKcal: true } },
      },
    });

    return patients.map((p) => {
      const last = p.consultations[0];
      const weight = num(last?.weightKg);
      const height = num(last?.heightCm);
      return {
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        sex: p.sex,
        age: ageFrom(p.birthDate),
        phone: p.phone,
        email: p.email,
        goal: p.goal,
        archivedAt: p.archivedAt,
        lastConsultation: last?.date ?? null,
        lastWeightKg: weight,
        lastBmi: weight && height ? round(weight / (height / 100) ** 2) : null,
        nextAppointment: p.appointments[0]?.startsAt ?? null,
        activePlanKcal: p.mealPlans[0]?.targetKcal ?? null,
      };
    });
  }

  async create(nutritionistId: string, dto: PatientDto) {
    await assertCanAddPatient(this.prisma, nutritionistId);
    return this.prisma.patient.create({
      data: { ...dto, nutritionistId, birthDate: dateFromString(dto.birthDate) },
    });
  }

  async get(nutritionistId: string, patientId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, nutritionistId },
      include: {
        background: true,
        dietHistory: true,
        labResults: { orderBy: [{ takenOn: "desc" }, { createdAt: "desc" }] },
        medications: { orderBy: { createdAt: "desc" } },
        consultations: {
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          select: { id: true, date: true, type: true, weightKg: true, diagnosis: true, adherencePct: true },
        },
        mealPlans: {
          orderBy: { createdAt: "desc" },
          select: { id: true, title: true, status: true, targetKcal: true, createdAt: true, approvedAt: true },
        },
        appointments: {
          where: { startsAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
          orderBy: { startsAt: "asc" },
          take: 5,
        },
      },
    });
    if (!patient) throw new NotFoundException("Paciente no encontrado");
    return { ...patient, age: ageFrom(patient.birthDate) };
  }

  async update(nutritionistId: string, patientId: string, dto: UpdatePatientDto) {
    await ownedPatient(this.prisma, nutritionistId, patientId);
    return this.prisma.patient.update({
      where: { id: patientId },
      data: { ...dto, birthDate: dto.birthDate ? dateFromString(dto.birthDate) : undefined },
    });
  }

  async setArchived(nutritionistId: string, patientId: string, archived: boolean) {
    await ownedPatient(this.prisma, nutritionistId, patientId);
    if (!archived) await assertCanAddPatient(this.prisma, nutritionistId);
    return this.prisma.patient.update({ where: { id: patientId }, data: { archivedAt: archived ? new Date() : null } });
  }

  async remove(nutritionistId: string, patientId: string) {
    await ownedPatient(this.prisma, nutritionistId, patientId);
    await this.prisma.patient.delete({ where: { id: patientId } });
  }

  async saveBackground(nutritionistId: string, patientId: string, dto: BackgroundDto) {
    await ownedPatient(this.prisma, nutritionistId, patientId);
    return this.prisma.patientBackground.upsert({
      where: { patientId },
      create: { ...dto, patientId },
      update: dto,
    });
  }

  async saveDietHistory(nutritionistId: string, patientId: string, dto: DietHistoryDto) {
    await ownedPatient(this.prisma, nutritionistId, patientId);
    return this.prisma.dietHistory.upsert({
      where: { patientId },
      create: { ...dto, patientId },
      update: dto,
    });
  }

  // ─── Laboratorios ───

  async addLab(nutritionistId: string, patientId: string, dto: LabResultDto) {
    await ownedPatient(this.prisma, nutritionistId, patientId);
    return this.prisma.labResult.create({ data: { ...dto, patientId, takenOn: dateFromString(dto.takenOn) } });
  }

  async updateLab(nutritionistId: string, patientId: string, labId: string, dto: LabResultDto) {
    await this.ownedChild("labResult", nutritionistId, patientId, labId);
    return this.prisma.labResult.update({ where: { id: labId }, data: { ...dto, takenOn: dateFromString(dto.takenOn) } });
  }

  async removeLab(nutritionistId: string, patientId: string, labId: string) {
    await this.ownedChild("labResult", nutritionistId, patientId, labId);
    await this.prisma.labResult.delete({ where: { id: labId } });
  }

  // ─── Medicamentos y suplementos ───

  async addMedication(nutritionistId: string, patientId: string, dto: MedicationDto) {
    await ownedPatient(this.prisma, nutritionistId, patientId);
    return this.prisma.medication.create({ data: { ...this.medicationData(dto), patientId } });
  }

  async updateMedication(nutritionistId: string, patientId: string, medicationId: string, dto: MedicationDto) {
    await this.ownedChild("medication", nutritionistId, patientId, medicationId);
    return this.prisma.medication.update({ where: { id: medicationId }, data: this.medicationData(dto) });
  }

  async removeMedication(nutritionistId: string, patientId: string, medicationId: string) {
    await this.ownedChild("medication", nutritionistId, patientId, medicationId);
    await this.prisma.medication.delete({ where: { id: medicationId } });
  }

  private medicationData(dto: MedicationDto) {
    return {
      ...dto,
      startedOn: dto.startedOn ? dateFromString(dto.startedOn) : null,
      endedOn: dto.endedOn ? dateFromString(dto.endedOn) : null,
    };
  }

  private async ownedChild(model: "labResult" | "medication", nutritionistId: string, patientId: string, id: string) {
    const where = { id, patientId, patient: { nutritionistId } };
    const found =
      model === "labResult"
        ? await this.prisma.labResult.findFirst({ where, select: { id: true } })
        : await this.prisma.medication.findFirst({ where, select: { id: true } });
    if (!found) throw new NotFoundException("Registro no encontrado");
  }

  // ─── Evolución ───

  // Serie de medidas e indicadores de todas las consultas, de la más antigua a la más reciente.
  async evolution(nutritionistId: string, patientId: string) {
    const patient = await ownedPatient(this.prisma, nutritionistId, patientId);
    const consultations = await this.prisma.consultation.findMany({
      where: { patientId },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });

    const initialWeight = num(consultations.find((c) => c.weightKg !== null)?.weightKg);
    let previousWeight: number | null = null;

    const points = consultations.map((c) => {
      const weight = num(c.weightKg);
      const indicators = anthropometry({
        sex: patient.sex,
        ageYears: ageFrom(patient.birthDate, c.date),
        weightKg: weight,
        heightCm: num(c.heightCm),
        waistCm: num(c.waistCm),
        hipCm: num(c.hipCm),
        bodyFatPct: num(c.bodyFatPct),
        previousWeightKg: previousWeight,
        initialWeightKg: initialWeight,
      });
      if (weight !== null) previousWeight = weight;
      const value = (key: string) => indicators.find((i) => i.key === key)?.value ?? null;
      return {
        consultationId: c.id,
        date: c.date,
        type: c.type,
        weightKg: weight,
        bmi: value("bmi"),
        waistCm: num(c.waistCm),
        hipCm: num(c.hipCm),
        bodyFatPct: num(c.bodyFatPct),
        muscleMassKg: num(c.muscleMassKg),
        whr: value("whr"),
        adherencePct: c.adherencePct,
        symptoms: c.symptoms,
        treatmentChanges: c.treatmentChanges,
      };
    });

    const withWeight = points.filter((p) => p.weightKg !== null);
    const first = withWeight[0];
    const last = withWeight[withWeight.length - 1];

    return {
      points,
      summary: {
        consultations: points.length,
        initialWeightKg: first?.weightKg ?? null,
        currentWeightKg: last?.weightKg ?? null,
        weightChangeKg: first && last ? round(last.weightKg! - first.weightKg!) : null,
        initialBmi: first?.bmi ?? null,
        currentBmi: last?.bmi ?? null,
      },
    };
  }
}
