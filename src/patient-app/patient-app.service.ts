import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { FoodLogSource, Prisma } from "@prisma/client";
import { assertNoOverlap } from "../appointments/appointments.controller";
import { ownedPatient } from "../common/access";
import { randomCode } from "../common/codes";
import { dateFromString, num } from "../common/dates";
import { config } from "../config";
import { MealPlansService } from "../meal-plans/meal-plans.service";
import { macroGrams, round } from "../nutrition/calc";
import { PatientsService } from "../patients/patients.service";
import { PrismaService } from "../prisma/prisma.service";
import { FoodVision } from "./food-vision";
import { AppointmentRequestDto, FoodItemDto, FoodLogDto, FoodScanDto, WeightDto } from "./patient-app.dto";

function totals(items: FoodItemDto[]) {
  const t = items.reduce(
    (acc, i) => ({ kcal: acc.kcal + i.kcal, choG: acc.choG + i.choG, proG: acc.proG + i.proG, fatG: acc.fatG + i.fatG }),
    { kcal: 0, choG: 0, proG: 0, fatG: 0 },
  );
  return { kcal: Math.round(t.kcal), choG: round(t.choG), proG: round(t.proG), fatG: round(t.fatG) };
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function pct(part: number, whole: number | null | undefined): number | null {
  return whole ? Math.round((part / whole) * 100) : null;
}

@Injectable()
export class PatientAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: MealPlansService,
    private readonly patients: PatientsService,
    private readonly vision: FoodVision,
  ) {}

  // ─── Lado de la nutricionista ───

  async createInvite(nutritionistId: string, patientId: string) {
    const patient = await ownedPatient(this.prisma, nutritionistId, patientId);
    if (patient.archivedAt) throw new BadRequestException("El paciente está archivado");
    if (patient.userId) throw new ConflictException("Este paciente ya activó la app");
    const expiresAt = new Date(Date.now() + config.inviteDays * 24 * 60 * 60 * 1000);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const updated = await this.prisma.patient.update({
          where: { id: patientId },
          data: { inviteCode: randomCode(), inviteExpiresAt: expiresAt },
        });
        return { code: updated.inviteCode, expiresAt };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
        throw err;
      }
    }
    throw new ConflictException("No pudimos generar el código. Inténtalo de nuevo.");
  }

  // Quita el acceso a la app: borra la cuenta del paciente (su expediente se conserva).
  async revokeAccess(nutritionistId: string, patientId: string) {
    const patient = await ownedPatient(this.prisma, nutritionistId, patientId);
    await this.prisma.$transaction([
      this.prisma.patient.update({ where: { id: patientId }, data: { userId: null, inviteCode: null, inviteExpiresAt: null } }),
      ...(patient.userId ? [this.prisma.user.delete({ where: { id: patient.userId } })] : []),
    ]);
  }

  // Estado del acceso y lo que el paciente registró en la app.
  async activity(nutritionistId: string, patientId: string, days: number) {
    const patient = await ownedPatient(this.prisma, nutritionistId, patientId);
    const from = dateFromString(new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10));
    const [user, foodLogs, weightLogs, plan] = await Promise.all([
      patient.userId ? this.prisma.user.findUnique({ where: { id: patient.userId } }) : null,
      this.prisma.foodLog.findMany({ where: { patientId, date: { gte: from } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
      this.prisma.weightLog.findMany({ where: { patientId }, orderBy: { date: "desc" }, take: 30 }),
      this.approvedPlan(patientId),
    ]);

    const byDay = new Map<string, { date: string; kcal: number; choG: number; proG: number; fatG: number; entries: number }>();
    for (const log of foodLogs) {
      const key = log.date.toISOString().slice(0, 10);
      const day = byDay.get(key) ?? { date: key, kcal: 0, choG: 0, proG: 0, fatG: 0, entries: 0 };
      day.kcal += log.kcal;
      day.choG += num(log.choG)!;
      day.proG += num(log.proG)!;
      day.fatG += num(log.fatG)!;
      day.entries++;
      byDay.set(key, day);
    }

    return {
      access: {
        linked: !!user,
        email: user?.email ?? null,
        lastLoginAt: user?.lastLoginAt ?? null,
        inviteCode: !user && patient.inviteExpiresAt && patient.inviteExpiresAt > new Date() ? patient.inviteCode : null,
        inviteExpiresAt: !user ? patient.inviteExpiresAt : null,
      },
      targetKcal: plan?.targetKcal ?? null,
      days: [...byDay.values()].map((d) => ({
        ...d,
        choG: round(d.choG),
        proG: round(d.proG),
        fatG: round(d.fatG),
        pctOfTarget: pct(d.kcal, plan?.targetKcal),
      })),
      foodLogs,
      weightLogs,
    };
  }

  // ─── Lado del paciente ───

  async current(userId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { userId },
      include: { nutritionist: { select: { fullName: true, clinicName: true, phone: true, email: true, status: true } } },
    });
    if (!patient) throw new NotFoundException("Tu cuenta no está vinculada a un expediente");
    if (patient.archivedAt || patient.nutritionist.status !== "ACTIVE") {
      throw new ForbiddenException("Tu acceso está en pausa. Consulta con tu nutricionista.");
    }
    return patient;
  }

  async me(userId: string) {
    const p = await this.current(userId);
    return {
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      sex: p.sex,
      birthDate: p.birthDate,
      goal: p.goal,
      nutritionist: { fullName: p.nutritionist.fullName, clinicName: p.nutritionist.clinicName, phone: p.nutritionist.phone, email: p.nutritionist.email },
    };
  }

  private approvedPlan(patientId: string) {
    return this.prisma.mealPlan.findFirst({
      where: { patientId, status: "APPROVED" },
      orderBy: { approvedAt: "desc" },
    });
  }

  // Plan aprobado vigente, sin las notas internas de la nutricionista.
  async plan(userId: string) {
    const patient = await this.current(userId);
    const plan = await this.approvedPlan(patient.id);
    if (!plan) return null;
    const detail = await this.plans.detail(patient.nutritionistId, plan.id);
    const { notes: _notes, ...visible } = detail;
    return visible;
  }

  // Lista de intercambios: alimentos de cada grupo del plan con su porción equivalente.
  async exchangeList(userId: string) {
    const patient = await this.current(userId);
    const plan = await this.approvedPlan(patient.id);
    if (!plan) return [];
    const detail = await this.plans.detail(patient.nutritionistId, plan.id);
    const keys = Object.keys(detail.daily);
    const foods = await this.prisma.food.findMany({
      where: {
        active: true,
        source: { in: detail.allowedFoodSources },
        OR: [{ nutritionistId: null }, { nutritionistId: patient.nutritionistId }],
        group: { key: { in: keys } },
      },
      orderBy: { name: "asc" },
      include: { group: true },
    });
    return detail.system.groups
      .filter((g) => keys.includes(g.key))
      .map((g) => ({
        key: g.key,
        name: g.name,
        color: g.color,
        portionHint: g.portionHint,
        servingsPerDay: detail.daily[g.key],
        foods: foods
          .filter((f) => f.group?.key === g.key)
          .map((f) => ({ id: f.id, name: f.name, portion: f.portionText, kcal: num(f.kcal) })),
      }));
  }

  // Resumen de un día: objetivo del plan, lo planeado por tiempo de comida y lo consumido.
  async day(userId: string, date = todayString()) {
    const patient = await this.current(userId);
    return this.daySummary(patient.id, patient.nutritionistId, date);
  }

  private async daySummary(patientId: string, nutritionistId: string, date: string) {
    const plan = await this.approvedPlan(patientId);
    const detail = plan ? await this.plans.detail(nutritionistId, plan.id) : null;
    const logs = await this.prisma.foodLog.findMany({
      where: { patientId, date: dateFromString(date) },
      orderBy: { createdAt: "asc" },
    });
    const consumed = logs.reduce(
      (t, l) => ({ kcal: t.kcal + l.kcal, choG: t.choG + num(l.choG)!, proG: t.proG + num(l.proG)!, fatG: t.fatG + num(l.fatG)! }),
      { kcal: 0, choG: 0, proG: 0, fatG: 0 },
    );
    const target = detail?.target ?? null;
    const meals = (detail?.meals ?? []).map((m) => {
      const mealLogs = logs.filter((l) => l.mealName === m.name);
      return {
        name: m.name,
        time: m.time,
        plannedKcal: m.plannedTotals.kcal,
        consumedKcal: mealLogs.reduce((s, l) => s + l.kcal, 0),
        entries: mealLogs.length,
      };
    });

    return {
      date,
      hasPlan: !!detail,
      target,
      consumed: { kcal: consumed.kcal, choG: round(consumed.choG), proG: round(consumed.proG), fatG: round(consumed.fatG) },
      remainingKcal: target ? target.kcal - consumed.kcal : null,
      pctOfTarget: pct(consumed.kcal, target?.kcal),
      meals,
      logs,
    };
  }

  // Analiza una foto y la compara con lo que le toca en el día y en esa comida. No guarda la imagen.
  async scan(userId: string, dto: FoodScanDto) {
    const patient = await this.current(userId);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await this.prisma.foodScan.count({ where: { patientId: patient.id, createdAt: { gte: since } } });
    if (recent >= config.foodScanDailyLimit) {
      throw new ForbiddenException(`Llegaste al límite de ${config.foodScanDailyLimit} fotos por día. Puedes registrar la comida a mano.`);
    }

    const estimate = await this.vision.analyze(dto.image, dto.mimeType ?? "image/jpeg", dto.hint);
    const total = totals(estimate.items);
    await this.prisma.foodScan.create({
      data: { patientId: patient.id, model: this.vision.model, isFood: estimate.isFood, kcal: estimate.isFood ? total.kcal : null },
    });

    const date = dto.date ?? todayString();
    const day = await this.daySummary(patient.id, patient.nutritionistId, date);
    const meal = dto.mealName ? day.meals.find((m) => m.name === dto.mealName) : undefined;
    const target = day.target;

    return {
      ...estimate,
      totals: total,
      comparison: {
        date,
        targetKcal: target?.kcal ?? null,
        consumedBeforeKcal: day.consumed.kcal,
        pctOfDay: pct(total.kcal, target?.kcal),
        remainingAfterKcal: target ? target.kcal - day.consumed.kcal - total.kcal : null,
        macros: target
          ? {
              choG: { value: total.choG, target: target.choG, pct: pct(total.choG, target.choG) },
              proG: { value: total.proG, target: target.proG, pct: pct(total.proG, target.proG) },
              fatG: { value: total.fatG, target: target.fatG, pct: pct(total.fatG, target.fatG) },
            }
          : null,
        meal: meal
          ? {
              name: meal.name,
              plannedKcal: meal.plannedKcal,
              consumedBeforeKcal: meal.consumedKcal,
              pctOfMeal: pct(total.kcal, meal.plannedKcal),
              remainingAfterKcal: meal.plannedKcal - meal.consumedKcal - total.kcal,
            }
          : null,
      },
    };
  }

  async addFoodLog(userId: string, dto: FoodLogDto) {
    const patient = await this.current(userId);
    if (!dto.items.length) throw new BadRequestException("Agrega al menos un alimento");
    const t = totals(dto.items);
    return this.prisma.foodLog.create({
      data: {
        patientId: patient.id,
        date: dateFromString(dto.date),
        mealName: dto.mealName?.trim() || null,
        description: dto.description.trim(),
        items: dto.items.map((i) => ({ ...i })) as unknown as Prisma.InputJsonValue,
        kcal: t.kcal,
        choG: t.choG,
        proG: t.proG,
        fatG: t.fatG,
        source: dto.source === "PHOTO" ? FoodLogSource.PHOTO : FoodLogSource.MANUAL,
        confidence: dto.confidence ?? null,
      },
    });
  }

  async foodLogs(userId: string, from?: string, to?: string) {
    const patient = await this.current(userId);
    return this.prisma.foodLog.findMany({
      where: {
        patientId: patient.id,
        date: { gte: from ? dateFromString(from) : undefined, lte: to ? dateFromString(to) : undefined },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
  }

  async removeFoodLog(userId: string, id: string) {
    const patient = await this.current(userId);
    const deleted = await this.prisma.foodLog.deleteMany({ where: { id, patientId: patient.id } });
    if (!deleted.count) throw new NotFoundException("Registro no encontrado");
  }

  // Evolución de las consultas (medidas tomadas por la nutricionista) y pesos anotados por el paciente.
  async progress(userId: string) {
    const patient = await this.current(userId);
    const [evolution, weights] = await Promise.all([
      this.patients.evolution(patient.nutritionistId, patient.id),
      this.prisma.weightLog.findMany({ where: { patientId: patient.id }, orderBy: { date: "asc" } }),
    ]);
    return {
      summary: evolution.summary,
      consultations: evolution.points.map((p) => ({
        date: p.date,
        weightKg: p.weightKg,
        bmi: p.bmi,
        waistCm: p.waistCm,
        bodyFatPct: p.bodyFatPct,
      })),
      weights,
    };
  }

  async addWeight(userId: string, dto: WeightDto) {
    const patient = await this.current(userId);
    const date = dateFromString(dto.date);
    return this.prisma.weightLog.upsert({
      where: { patientId_date: { patientId: patient.id, date } },
      create: { patientId: patient.id, date, weightKg: dto.weightKg, note: dto.note },
      update: { weightKg: dto.weightKg, note: dto.note },
    });
  }

  async removeWeight(userId: string, id: string) {
    const patient = await this.current(userId);
    const deleted = await this.prisma.weightLog.deleteMany({ where: { id, patientId: patient.id } });
    if (!deleted.count) throw new NotFoundException("Registro no encontrado");
  }

  // Citas próximas (incluye solicitudes) y las rechazadas o canceladas recientes, para que vea la respuesta.
  async appointments(userId: string) {
    const patient = await this.current(userId);
    const recent = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    return this.prisma.appointment.findMany({
      where: {
        patientId: patient.id,
        OR: [
          { startsAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) } },
          { status: { in: ["REJECTED", "CANCELLED", "COMPLETED"] }, updatedAt: { gte: recent } },
        ],
      },
      orderBy: { startsAt: "asc" },
      take: 30,
      select: {
        id: true,
        startsAt: true,
        durationMinutes: true,
        type: true,
        status: true,
        notes: true,
        responseNote: true,
        requestedByPatient: true,
        updatedAt: true,
      },
    });
  }

  // Horarios ocupados de la nutricionista en un día (sin datos de otros pacientes).
  async busy(userId: string, date: string) {
    const patient = await this.current(userId);
    const day = new Date(`${date}T00:00:00Z`);
    // Margen de un día a cada lado para cubrir cualquier zona horaria.
    const from = new Date(day.getTime() - 24 * 60 * 60 * 1000);
    const to = new Date(day.getTime() + 48 * 60 * 60 * 1000);
    const appointments = await this.prisma.appointment.findMany({
      where: { nutritionistId: patient.nutritionistId, status: { in: ["SCHEDULED", "REQUESTED"] }, startsAt: { gte: from, lt: to } },
      select: { startsAt: true, durationMinutes: true, status: true, patientId: true },
    });
    return appointments.map((a) => ({
      startsAt: a.startsAt,
      endsAt: new Date(a.startsAt.getTime() + a.durationMinutes * 60_000),
      mine: a.patientId === patient.id,
      confirmed: a.status === "SCHEDULED",
    }));
  }

  async requestAppointment(userId: string, dto: AppointmentRequestDto) {
    const patient = await this.current(userId);
    const startsAt = new Date(dto.startsAt);
    if (startsAt.getTime() < Date.now() + 60 * 60 * 1000) {
      throw new BadRequestException("Elige una hora con al menos una hora de anticipación");
    }
    const pending = await this.prisma.appointment.count({ where: { patientId: patient.id, status: "REQUESTED" } });
    if (pending >= 3) throw new BadRequestException("Ya tienes solicitudes pendientes. Espera la respuesta de tu nutricionista.");
    await assertNoOverlap(this.prisma, patient.nutritionistId, startsAt, 45, undefined, () => "Ese horario ya está ocupado. Elige otro.");
    const hasConsultations = await this.prisma.consultation.count({ where: { patientId: patient.id } });
    return this.prisma.appointment.create({
      data: {
        nutritionistId: patient.nutritionistId,
        patientId: patient.id,
        startsAt,
        durationMinutes: 45,
        type: dto.type ?? (hasConsultations ? "FOLLOW_UP" : "FIRST_VISIT"),
        status: "REQUESTED",
        notes: dto.notes?.trim() || null,
        requestedByPatient: true,
      },
    });
  }

  async cancelAppointment(userId: string, id: string) {
    const patient = await this.current(userId);
    const appointment = await this.prisma.appointment.findFirst({ where: { id, patientId: patient.id } });
    if (!appointment) throw new NotFoundException("Cita no encontrada");
    if (!["REQUESTED", "SCHEDULED"].includes(appointment.status)) throw new BadRequestException("Esta cita ya no se puede cancelar");
    if (appointment.startsAt < new Date()) throw new BadRequestException("La cita ya pasó");
    return this.prisma.appointment.update({ where: { id }, data: { status: "CANCELLED" } });
  }
}
