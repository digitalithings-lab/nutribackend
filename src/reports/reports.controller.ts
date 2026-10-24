import { Controller, Get, Injectable, Param, ParseUUIDPipe, Res, StreamableFile } from "@nestjs/common";
import { User } from "@prisma/client";
import type { Response } from "express";
import { ownedPatient } from "../common/access";
import { AuthUser, CurrentUser } from "../common/auth.decorators";
import { num } from "../common/dates";
import { Roles } from "../common/roles";
import { ConsultationsService } from "../consultations/consultations.controller";
import { MealPlansService } from "../meal-plans/meal-plans.service";
import { ageFrom, EQUATIONS } from "../nutrition/calc";
import { PatientsService } from "../patients/patients.service";
import { PrismaService } from "../prisma/prisma.service";
import { Pdf } from "./pdf";

const SEX = { FEMALE: "Femenino", MALE: "Masculino" } as const;
const MODE = { TRADITIONAL: "Listas tradicionales", PANAMA: "Base de alimentos de Panamá", COMBINED: "Combinado" } as const;

// Las fechas sin hora se guardan a mediodía UTC; los momentos (aprobación, hoy) se muestran
// en la zona horaria de la nutricionista.
function fmtDate(date: Date | string, timeZone = "UTC"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("es-PA", { day: "numeric", month: "long", year: "numeric", timeZone });
}

function shortDate(date: Date): string {
  return date.toLocaleDateString("es-PA", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "UTC" });
}

function fmt(value: number | null | undefined, unit = ""): string | null {
  if (value === null || value === undefined) return null;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}${unit ? ` ${unit}` : ""}`;
}

function servingsText(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".0", "");
}

function headerFor(user: User) {
  return {
    nutritionist: user.fullName,
    license: user.licenseNumber,
    clinic: user.clinicName,
    contact: [user.phone, user.email].filter(Boolean).join(" · "),
    timezone: user.timezone,
  };
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: MealPlansService,
    private readonly consultations: ConsultationsService,
    private readonly patients: PatientsService,
  ) {}

  // Plan alimentario para entregar al paciente.
  async mealPlan(nutritionistId: string, planId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: nutritionistId } });
    const plan = await this.plans.detail(nutritionistId, planId);
    const groups = plan.system.groups;
    const groupName = (key: string) => groups.find((g) => g.key === key)?.name ?? key;
    const patientName = `${plan.patient.firstName} ${plan.patient.lastName}`;

    const pdf = new Pdf({
      ...headerFor(user),
      title: "Plan alimentario personalizado",
      subtitle: `${patientName} · ${plan.patient.age} años · ${fmtDate(plan.approvedAt ?? plan.updatedAt, user.timezone)}`,
      draft: plan.status !== "APPROVED",
    });

    if (plan.objectives.length) {
      pdf.section("Objetivos");
      pdf.bullets(plan.objectives);
    }

    pdf.section("Resumen nutricional");
    pdf.fields(
      [
        ["Energía", `${plan.target.kcal} kcal/día`],
        ["Carbohidratos", `${plan.choPct} % · ${plan.target.choG} g`],
        ["Proteínas", `${plan.proPct} % · ${plan.target.proG} g`],
        ["Grasas", `${plan.fatPct} % · ${plan.target.fatG} g`],
      ],
      4,
    );

    pdf.section("Intercambios por día");
    pdf.table(
      ["Grupo", "Porciones al día", "Equivalencia de 1 porción"],
      groups
        .filter((g) => plan.daily[g.key])
        .map((g) => [g.name, servingsText(plan.daily[g.key]), g.portionHint ?? ""]),
      [0.35, 0.2, 0.45],
      { boldFirst: true },
    );

    pdf.section("Menú");
    for (const meal of plan.meals) {
      pdf.ensureSpace(70);
      pdf.doc
        .fillColor("#22302c")
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(`${meal.name}${meal.time ? ` · ${meal.time}` : ""}`);
      const exchanges = Object.entries(meal.exchanges)
        .map(([k, v]) => `${servingsText(v)} ${groupName(k).toLowerCase()}`)
        .join(", ");
      if (exchanges) pdf.paragraph(`Intercambios: ${exchanges}`, { muted: true, size: 8.5 });

      const mains = meal.items.filter((i) => !i.substituteOfId);
      if (mains.length) {
        pdf.table(
          ["Alimento", "Cantidad", "Puedes cambiarlo por"],
          mains.map((item) => {
            const subs = meal.items
              .filter((s) => s.substituteOfId === item.id)
              .map((s) => `${itemName(s)} (${itemAmount(s)})`)
              .join("; ");
            return [itemName(item) + (item.notes ? `\n${item.notes}` : ""), itemAmount(item), subs || "—"];
          }),
          [0.38, 0.27, 0.35],
        );
      } else {
        pdf.paragraph("Elige alimentos de los grupos indicados.", { muted: true, size: 9 });
      }
      if (meal.notes) pdf.paragraph(meal.notes, { size: 9 });
    }

    // Lista de equivalentes por grupo, para que el paciente pueda variar.
    const usedKeys = Object.keys(plan.daily);
    const foods = await this.prisma.food.findMany({
      where: {
        active: true,
        source: { in: plan.allowedFoodSources },
        OR: [{ nutritionistId: null }, { nutritionistId }],
        group: { key: { in: usedKeys } },
      },
      orderBy: { name: "asc" },
      include: { group: true },
    });
    if (foods.length) {
      pdf.doc.addPage();
      pdf.section("Lista de intercambios (1 porción de cada alimento equivale a otra del mismo grupo)");
      for (const g of groups.filter((g) => usedKeys.includes(g.key))) {
        const list = foods.filter((f) => f.group?.key === g.key);
        if (!list.length) continue;
        pdf.ensureSpace(50);
        pdf.doc.fillColor("#2f7d6d").font("Helvetica-Bold").fontSize(10).text(g.name);
        pdf.table(
          ["Alimento", "Porción"],
          list.map((f) => [f.name, f.portionText]),
          [0.55, 0.45],
        );
      }
    }

    if (plan.recommendations) {
      pdf.section("Recomendaciones");
      pdf.paragraph(plan.recommendations);
    }

    return { buffer: await pdf.finish(), filename: `plan-${slug(patientName)}.pdf` };
  }

  // Evaluación nutricional de una consulta.
  async evaluation(nutritionistId: string, consultationId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: nutritionistId } });
    const c = await this.consultations.detail(nutritionistId, consultationId);
    const patient = await this.prisma.patient.findUniqueOrThrow({
      where: { id: c.patient.id },
      include: { background: true, dietHistory: true, labResults: { orderBy: { takenOn: "desc" }, take: 12 }, medications: true },
    });
    const name = `${patient.firstName} ${patient.lastName}`;

    const pdf = new Pdf({
      ...headerFor(user),
      title: c.type === "INITIAL" ? "Evaluación nutricional inicial" : "Evaluación de seguimiento",
      subtitle: `${name} · ${fmtDate(c.date)}`,
    });

    pdf.section("Datos del paciente");
    pdf.fields([
      ["Nombre", name],
      ["Edad", `${c.ageYears} años`],
      ["Sexo", SEX[patient.sex]],
      ["Ocupación", patient.occupation],
      ["Motivo de consulta", c.reason ?? patient.reason],
      ["Objetivo", patient.goal],
    ]);

    const b = patient.background;
    if (b) {
      const rows = (
        [
          ["Patológicos", b.pathological],
          ["Familiares", b.family],
          ["Quirúrgicos", b.surgical],
          ["Alergias", b.allergies],
          ["Intolerancias", b.intolerances],
          ["Gastrointestinales", b.gastrointestinal],
          ["Gineco-obstétricos", b.gynecological],
          ["Actividad física", b.physicalActivity],
          ["Sueño", b.sleep],
          ["Tabaco / alcohol", [b.smoking, b.alcohol].filter(Boolean).join(" · ")],
        ] as [string, string | null][]
      ).filter(([, v]) => v);
      if (rows.length) {
        pdf.section("Antecedentes");
        pdf.table(["", ""], rows as string[][], [0.3, 0.7], { boldFirst: true });
      }
    }

    const active = patient.medications.filter((m) => !m.endedOn || m.endedOn > new Date());
    if (active.length) {
      pdf.section("Medicamentos y suplementos");
      pdf.table(
        ["Nombre", "Dosis", "Frecuencia"],
        active.map((m) => [m.name + (m.isSupplement ? " (suplemento)" : ""), m.dose ?? "", m.frequency ?? ""]),
        [0.45, 0.25, 0.3],
      );
    }

    const d = patient.dietHistory;
    if (d) {
      const rows = (
        [
          ["Comidas al día", d.mealsPerDay ? String(d.mealsPerDay) : null],
          ["Recordatorio 24 h", d.recall24h],
          ["Frecuencia de consumo", d.foodFrequency],
          ["Preferencias", d.preferences],
          ["Aversiones", d.aversions],
          ["Consumo de agua", d.waterIntake],
          ["Apetito", d.appetite],
        ] as [string, string | null][]
      ).filter(([, v]) => v);
      if (rows.length) {
        pdf.section("Historia alimentaria");
        pdf.table(["", ""], rows as string[][], [0.3, 0.7], { boldFirst: true });
      }
    }

    pdf.section("Antropometría");
    pdf.fields(
      [
        ["Peso", fmt(num(c.weightKg), "kg")],
        ["Talla", fmt(num(c.heightCm), "cm")],
        ["Cintura", fmt(num(c.waistCm), "cm")],
        ["Cadera", fmt(num(c.hipCm), "cm")],
        ["Brazo", fmt(num(c.armCm), "cm")],
        ["Pantorrilla", fmt(num(c.calfCm), "cm")],
        ["Grasa corporal", fmt(num(c.bodyFatPct), "%")],
        ["Masa muscular", fmt(num(c.muscleMassKg), "kg")],
        ["Presión arterial", c.systolicBp && c.diastolicBp ? `${c.systolicBp}/${c.diastolicBp} mmHg` : null],
      ],
      4,
    );
    if (c.indicators.length) {
      pdf.table(
        ["Indicador", "Valor", "Interpretación"],
        c.indicators.map((i) => [i.label, `${i.value} ${i.unit}`.trim(), i.status ?? ""]),
        [0.4, 0.25, 0.35],
      );
    }

    if (patient.labResults.length) {
      pdf.section("Laboratorios recientes");
      pdf.table(
        ["Fecha", "Prueba", "Resultado", "Referencia"],
        patient.labResults.map((l) => [shortDate(l.takenOn), l.name, `${l.value} ${l.unit ?? ""}`.trim(), l.reference ?? ""]),
        [0.15, 0.35, 0.25, 0.25],
      );
    }

    if (c.clinicalFindings) {
      pdf.section("Evaluación clínica");
      pdf.paragraph(c.clinicalFindings);
    }
    if (c.diagnosis) {
      pdf.section("Diagnóstico nutricional");
      pdf.paragraph(c.diagnosis);
    }
    if (c.type === "FOLLOW_UP") {
      pdf.section("Seguimiento");
      pdf.fields(
        [
          ["Adherencia", c.adherencePct !== null ? `${c.adherencePct} %` : null],
          ["Síntomas", c.symptoms],
          ["Cambios en el tratamiento", c.treatmentChanges],
        ],
        1,
      );
    }
    if (c.nextSteps || c.notes) {
      pdf.section("Plan de intervención");
      pdf.paragraph(c.nextSteps);
      pdf.paragraph(c.notes, { muted: true });
    }

    return { buffer: await pdf.finish(), filename: `evaluacion-${slug(name)}-${c.date.toISOString().slice(0, 10)}.pdf` };
  }

  // Informe de progreso con la evolución de todas las consultas.
  async progress(nutritionistId: string, patientId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: nutritionistId } });
    const patient = await ownedPatient(this.prisma, nutritionistId, patientId);
    const evolution = await this.patients.evolution(nutritionistId, patientId);
    const plan = await this.prisma.mealPlan.findFirst({
      where: { patientId, status: "APPROVED" },
      orderBy: { approvedAt: "desc" },
    });
    const name = `${patient.firstName} ${patient.lastName}`;

    const pdf = new Pdf({
      ...headerFor(user),
      title: "Informe de progreso",
      subtitle: `${name} · ${ageFrom(patient.birthDate)} años · ${fmtDate(new Date(), user.timezone)}`,
    });

    const s = evolution.summary;
    pdf.section("Resumen");
    pdf.fields(
      [
        ["Consultas", s.consultations],
        ["Peso inicial", fmt(s.initialWeightKg, "kg")],
        ["Peso actual", fmt(s.currentWeightKg, "kg")],
        ["Cambio", s.weightChangeKg !== null ? `${s.weightChangeKg > 0 ? "+" : ""}${s.weightChangeKg} kg` : null],
        ["IMC inicial", fmt(s.initialBmi)],
        ["IMC actual", fmt(s.currentBmi)],
        ["Plan vigente", plan ? `${plan.title} · ${plan.targetKcal} kcal` : null],
      ],
      4,
    );

    const weights = evolution.points.filter((p) => p.weightKg !== null);
    if (weights.length >= 2) {
      pdf.section("Evolución del peso");
      pdf.lineChart(
        weights.map((p) => ({ label: shortDate(p.date), value: p.weightKg! })),
        "kg",
      );
    }

    if (evolution.points.length) {
      pdf.section("Comparación de consultas");
      pdf.table(
        ["Fecha", "Peso", "IMC", "Cintura", "Cadera", "% grasa", "Adherencia"],
        evolution.points.map((p) => [
          shortDate(p.date),
          fmt(p.weightKg) ?? "—",
          fmt(p.bmi) ?? "—",
          fmt(p.waistCm) ?? "—",
          fmt(p.hipCm) ?? "—",
          fmt(p.bodyFatPct) ?? "—",
          p.adherencePct !== null ? `${p.adherencePct} %` : "—",
        ]),
      );
    }

    const notes = evolution.points.filter((p) => p.symptoms || p.treatmentChanges);
    if (notes.length) {
      pdf.section("Síntomas y cambios del tratamiento");
      pdf.table(
        ["Fecha", "Síntomas", "Cambios"],
        notes.map((p) => [shortDate(p.date), p.symptoms ?? "—", p.treatmentChanges ?? "—"]),
        [0.15, 0.425, 0.425],
      );
    }

    return { buffer: await pdf.finish(), filename: `progreso-${slug(name)}.pdf` };
  }

  // Requerimientos y cálculos del plan (informe técnico para la nutricionista u otro profesional).
  async planCalculations(nutritionistId: string, planId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: nutritionistId } });
    const plan = await this.plans.detail(nutritionistId, planId);
    const name = `${plan.patient.firstName} ${plan.patient.lastName}`;
    const pdf = new Pdf({
      ...headerFor(user),
      title: "Cálculo de requerimientos e intercambios",
      subtitle: `${name} · ${plan.title}`,
      draft: plan.status !== "APPROVED",
    });

    pdf.section("Energía");
    const equation = EQUATIONS.find((e) => e.value === plan.equation)?.label;
    pdf.fields(
      [
        ["Método", plan.calorieMethod === "MANUAL" ? "Manual" : "Automático"],
        ["Ecuación", equation],
        ["Peso usado", fmt(num(plan.weightKg), "kg")],
        ["Talla", fmt(num(plan.heightCm), "cm")],
        ["Edad", plan.ageYears ? `${plan.ageYears} años` : null],
        ["Sexo", plan.sex ? SEX[plan.sex] : null],
        ["Factor de actividad", fmt(num(plan.activityFactor))],
        ["GER", plan.restingKcal ? `${plan.restingKcal} kcal` : null],
        ["GET", plan.totalKcal ? `${plan.totalKcal} kcal` : null],
        ["Ajuste", plan.adjustmentPct ? `${plan.adjustmentPct} %` : plan.adjustmentKcal ? `${plan.adjustmentKcal} kcal` : null],
        ["Objetivo", `${plan.targetKcal} kcal`],
        ["Proteína por kg", plan.proteinPerKg ? `${plan.proteinPerKg} g/kg` : null],
      ],
      4,
    );

    pdf.section("Validación");
    pdf.table(
      ["", "Objetivo", "Intercambios", "Dif.", "Menú", "Dif."],
      plan.validation.exchangeChecks.map((ex, i) => {
        const menu = plan.validation.menuChecks[i];
        return [
          ex.label,
          String(ex.target),
          String(ex.actual),
          `${ex.diffPct} %`,
          menu ? String(menu.actual) : "—",
          menu ? `${menu.diffPct} %` : "—",
        ];
      }),
      undefined,
      { boldFirst: true },
    );
    if (plan.validation.warnings.length) pdf.bullets(plan.validation.warnings);

    pdf.section(`Distribución por tiempos de comida (${MODE[plan.exchangeMode]})`);
    const groups = plan.system.groups.filter((g) => plan.daily[g.key]);
    pdf.table(
      ["Tiempo", ...groups.map((g) => g.name), "kcal"],
      [
        ...plan.meals.map((m) => [
          m.name,
          ...groups.map((g) => (m.exchanges[g.key] ? servingsText(m.exchanges[g.key]) : "—")),
          String(m.plannedTotals.kcal),
        ]),
        ["Total", ...groups.map((g) => servingsText(plan.daily[g.key])), String(plan.exchangeTotals.kcal)],
      ],
      undefined,
      { boldFirst: true },
    );

    return { buffer: await pdf.finish(), filename: `calculos-${slug(name)}.pdf` };
  }
}

function itemName(item: { food?: { name: string } | null; recipe?: { name: string } | null; customName: string | null }) {
  return item.food?.name ?? item.recipe?.name ?? item.customName ?? "";
}

function itemAmount(item: { servings: unknown; food?: { portionText: string } | null; recipe?: unknown }) {
  const n = Number(item.servings);
  if (item.food) return n === 1 ? item.food.portionText : `${servingsText(n)} × ${item.food.portionText}`;
  if (item.recipe) return `${servingsText(n)} ración${n === 1 ? "" : "es"}`;
  return `${servingsText(n)} porción${n === 1 ? "" : "es"}`;
}

function slug(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

@Controller("reports")
@Roles("NUTRITIONIST")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("meal-plans/:id/plan.pdf")
  async mealPlan(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    return send(res, await this.reports.mealPlan(user.id, id));
  }

  @Get("meal-plans/:id/calculations.pdf")
  async calculations(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send(res, await this.reports.planCalculations(user.id, id));
  }

  @Get("consultations/:id/evaluation.pdf")
  async evaluation(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send(res, await this.reports.evaluation(user.id, id));
  }

  @Get("patients/:id/progress.pdf")
  async progress(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    return send(res, await this.reports.progress(user.id, id));
  }
}

function send(res: Response, file: { buffer: Buffer; filename: string }) {
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${file.filename}"` });
  return new StreamableFile(file.buffer);
}
