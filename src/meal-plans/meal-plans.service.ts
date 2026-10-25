import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { CalorieMethod, EnergyEquation, ExchangeMode, FoodSource, MealPlanStatus, Prisma } from "@prisma/client";
import { CatalogService, withRecipeTotals } from "../catalog/catalog.controller";
import { ownedPatient } from "../common/access";
import { num } from "../common/dates";
import {
  ageFrom,
  compare,
  DEFAULT_MEALS,
  distributeExchanges,
  energy,
  EnergyInputError,
  energyWeight,
  exerciseKcalPerDay,
  GroupValue,
  Macros,
  macroGrams,
  PHYSIOLOGICAL_EXTRAS,
  round,
  suggestExchanges,
  totalsFromServings,
  WeightBasis,
} from "../nutrition/calc";
import { PrismaService } from "../prisma/prisma.service";
import {
  ApproveDto,
  CreateMealPlanDto,
  EnergyDto,
  ActivityDetailDto,
  ExchangesDto,
  ItemDto,
  MacrosDto,
  MealsDto,
  UpdateItemDto,
  UpdateMealPlanDto,
} from "./meal-plans.dto";

const DEFAULT_ACTIVITY_FACTOR = 1.375;

const PLAN_INCLUDE = {
  patient: true,
  exchanges: true,
  meals: {
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          food: { include: { group: true } },
          recipe: { include: { ingredients: { include: { food: { include: { group: true } } } } } },
        },
      },
    },
  },
} satisfies Prisma.MealPlanInclude;

type FullPlan = Prisma.MealPlanGetPayload<{ include: typeof PLAN_INCLUDE }>;

// Sistema de equivalencias según el modo de trabajo. El modo combinado usa las listas
// tradicionales para las equivalencias y permite elegir alimentos de ambas bases.
export function systemCodeFor(mode: ExchangeMode): string {
  return mode === ExchangeMode.PANAMA ? "PANAMA" : "TRADICIONAL";
}

export function foodSourcesFor(mode: ExchangeMode): FoodSource[] {
  if (mode === ExchangeMode.TRADITIONAL) return [FoodSource.TRADITIONAL, FoodSource.CUSTOM];
  if (mode === ExchangeMode.PANAMA) return [FoodSource.PANAMA, FoodSource.CUSTOM];
  return [FoodSource.TRADITIONAL, FoodSource.PANAMA, FoodSource.CUSTOM];
}

// Peso relativo de cada tiempo de comida al repartir intercambios.
function mealShares(names: string[]): number[] {
  const known = names.map((name) => DEFAULT_MEALS.find((m) => m.name.toLowerCase() === name.toLowerCase())?.share);
  if (known.every((s) => s !== undefined)) return known as number[];
  return names.map((name) => (/merienda|colaci|snack|refrigerio/i.test(name) ? 0.1 : 0.25));
}

@Injectable()
export class MealPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  async list(nutritionistId: string, patientId: string) {
    await ownedPatient(this.prisma, nutritionistId, patientId);
    return this.prisma.mealPlan.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        targetKcal: true,
        choPct: true,
        proPct: true,
        fatPct: true,
        exchangeMode: true,
        createdAt: true,
        approvedAt: true,
        consultationId: true,
      },
    });
  }

  // Crea un borrador completo a partir de la última consulta: energía, macros,
  // intercambios sugeridos y tiempos de comida. Todo queda editable.
  async create(nutritionistId: string, patientId: string, dto: CreateMealPlanDto) {
    const patient = await ownedPatient(this.prisma, nutritionistId, patientId);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: nutritionistId } });

    const consultation = dto.consultationId
      ? await this.prisma.consultation.findFirst({ where: { id: dto.consultationId, patientId } })
      : await this.prisma.consultation.findFirst({
          where: { patientId, weightKg: { not: null } },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        });
    if (dto.consultationId && !consultation) throw new BadRequestException("La consulta no es de este paciente");

    const weightKg = num(consultation?.weightKg);
    const heightCm = num(consultation?.heightCm);
    const bodyFatPct = num(consultation?.bodyFatPct);
    const ageYears = ageFrom(patient.birthDate);

    let equation: EnergyEquation = user.defaultEquation;
    if (equation === EnergyEquation.KATCH_MCARDLE && !bodyFatPct) equation = EnergyEquation.MIFFLIN_ST_JEOR;
    if (equation === EnergyEquation.KCAL_PER_KG) equation = EnergyEquation.MIFFLIN_ST_JEOR;

    let energyData: Partial<Prisma.MealPlanUncheckedCreateInput> = {
      calorieMethod: CalorieMethod.MANUAL,
      targetKcal: 2000,
    };
    if (weightKg && heightCm) {
      const ew = energyWeight(weightKg, heightCm, "AUTO");
      const result = energy({
        equation,
        sex: patient.sex,
        ageYears,
        weightKg: ew.weightKg,
        heightCm,
        bodyFatPct,
        activityFactor: DEFAULT_ACTIVITY_FACTOR,
      });
      energyData = {
        calorieMethod: CalorieMethod.AUTOMATIC,
        equation,
        activityFactor: DEFAULT_ACTIVITY_FACTOR,
        weightBasis: "AUTO",
        energyWeightKg: ew.weightKg,
        ...result,
      };
    }

    const mode = user.defaultExchangeMode;
    const system = await this.prisma.exchangeSystem.findUniqueOrThrow({
      where: { code: systemCodeFor(mode) },
      include: { groups: true },
    });
    const target = macroGrams(energyData.targetKcal!, user.defaultChoPct, user.defaultProPct, user.defaultFatPct);
    const daily = suggestExchanges(system.groups.map(groupValue), target);
    const perMeal = distributeExchanges(daily, DEFAULT_MEALS.map((m) => m.share));
    const count = await this.prisma.mealPlan.count({ where: { patientId } });

    const plan = await this.prisma.mealPlan.create({
      data: {
        nutritionistId,
        patientId,
        consultationId: consultation?.id,
        title: dto.title ?? `Plan alimentario ${count + 1}`,
        weightKg,
        heightCm,
        ageYears,
        sex: patient.sex,
        bodyFatPct,
        targetKcal: 2000,
        ...energyData,
        choPct: user.defaultChoPct,
        proPct: user.defaultProPct,
        fatPct: user.defaultFatPct,
        exchangeMode: mode,
        systemId: system.id,
        objectives: patient.goal ? [patient.goal] : [],
        exchanges: { create: Object.entries(daily).map(([groupKey, servings]) => ({ groupKey, servings })) },
        meals: {
          create: DEFAULT_MEALS.map((m, i) => ({ name: m.name, time: m.time, sortOrder: i, exchanges: perMeal[i] })),
        },
      },
    });
    return this.detail(nutritionistId, plan.id);
  }

  async detail(nutritionistId: string, id: string) {
    const plan = await this.load(nutritionistId, id);
    const system = await this.prisma.exchangeSystem.findUniqueOrThrow({
      where: { id: plan.systemId },
      include: { groups: { orderBy: { sortOrder: "asc" } } },
    });
    return { ...this.present(plan, system), system };
  }

  // ─── Pasos del plan ───

  async setEnergy(nutritionistId: string, id: string, dto: EnergyDto) {
    const plan = await this.editable(nutritionistId, id);
    let data: Prisma.MealPlanUpdateInput;

    if (dto.calorieMethod === CalorieMethod.MANUAL) {
      if (!dto.targetKcal) throw new BadRequestException("Indica las calorías objetivo");
      data = {
        calorieMethod: CalorieMethod.MANUAL,
        equation: null,
        restingKcal: null,
        totalKcal: null,
        adjustmentPct: null,
        adjustmentKcal: null,
        targetKcal: dto.targetKcal,
      };
    } else {
      const weightKg = dto.weightKg ?? num(plan.weightKg);
      // Etapa fisiológica y ejercicio se convierten en kcal; el ejercicio se suma aparte del factor de actividad.
      const stage = dto.physiologicalStage ?? plan.physiologicalStage ?? "NONE";
      const physiological = PHYSIOLOGICAL_EXTRAS.find((p) => p.value === stage);
      if (!physiological) throw new BadRequestException("La etapa fisiológica no es válida");
      const activityDetail =
        dto.activityDetail === undefined ? ((plan.activityDetail as ActivityDetailDto | null) ?? null) : dto.activityDetail;
      const exerciseKcal = activityDetail && weightKg ? exerciseKcalPerDay(weightKg, activityDetail.exercises) : 0;
      const input = {
        equation: dto.equation ?? plan.equation ?? EnergyEquation.MIFFLIN_ST_JEOR,
        sex: dto.sex ?? plan.sex ?? plan.patient.sex,
        ageYears: dto.ageYears ?? plan.ageYears ?? ageFrom(plan.patient.birthDate),
        weightKg,
        heightCm: dto.heightCm ?? num(plan.heightCm),
        bodyFatPct: dto.bodyFatPct ?? num(plan.bodyFatPct),
        kcalPerKg: dto.kcalPerKg ?? num(plan.kcalPerKg),
        activityFactor: dto.activityFactor ?? num(plan.activityFactor) ?? DEFAULT_ACTIVITY_FACTOR,
        stressFactor: dto.stressFactor ?? num(plan.stressFactor) ?? 1,
        exerciseKcal,
        physiologicalKcal: physiological.kcal,
        adjustmentPct: dto.adjustmentPct === undefined ? plan.adjustmentPct : dto.adjustmentPct,
        adjustmentKcal: dto.adjustmentKcal === undefined ? plan.adjustmentKcal : dto.adjustmentKcal,
      };
      if (!input.weightKg) throw new BadRequestException("Indica el peso para el cálculo automático");
      // Las ecuaciones usan el peso ideal o el ajustado según el IMC (o el que elija la nutricionista).
      const weightBasis = (dto.weightBasis ?? plan.weightBasis ?? "AUTO") as WeightBasis;
      const ew = energyWeight(input.weightKg, input.heightCm, weightBasis);
      let result;
      try {
        result = energy({ ...input, weightKg: ew.weightKg });
      } catch (err) {
        if (err instanceof EnergyInputError) throw new BadRequestException(err.message);
        throw err;
      }
      data = {
        calorieMethod: CalorieMethod.AUTOMATIC,
        ...input,
        weightBasis,
        energyWeightKg: ew.weightKg,
        physiologicalStage: stage,
        activityDetail: activityDetail ? (JSON.parse(JSON.stringify(activityDetail)) as Prisma.InputJsonObject) : Prisma.DbNull,
        ...result,
      };
    }

    await this.prisma.mealPlan.update({ where: { id }, data });
    return this.detail(nutritionistId, id);
  }

  async setMacros(nutritionistId: string, id: string, dto: MacrosDto) {
    await this.editable(nutritionistId, id);
    if (dto.choPct + dto.proPct + dto.fatPct !== 100) {
      throw new BadRequestException("Los porcentajes de macronutrientes deben sumar 100 %");
    }
    await this.prisma.mealPlan.update({ where: { id }, data: dto });
    return this.detail(nutritionistId, id);
  }

  async setExchangeMode(nutritionistId: string, id: string, mode: ExchangeMode) {
    await this.editable(nutritionistId, id);
    const system = await this.prisma.exchangeSystem.findUniqueOrThrow({ where: { code: systemCodeFor(mode) } });
    await this.prisma.mealPlan.update({ where: { id }, data: { exchangeMode: mode, systemId: system.id } });
    return this.detail(nutritionistId, id);
  }

  // Sugiere intercambios diarios y los reparte entre los tiempos de comida.
  async suggest(nutritionistId: string, id: string) {
    const plan = await this.editable(nutritionistId, id);
    const groups = await this.prisma.exchangeGroup.findMany({ where: { systemId: plan.systemId } });
    const daily = suggestExchanges(groups.map(groupValue), this.targetMacros(plan));
    await this.saveDaily(id, daily);
    await this.distributeInto(plan, daily);
    return this.detail(nutritionistId, id);
  }

  async setExchanges(nutritionistId: string, id: string, dto: ExchangesDto) {
    const plan = await this.editable(nutritionistId, id);
    const groups = await this.prisma.exchangeGroup.findMany({ where: { systemId: plan.systemId }, select: { key: true } });
    const keys = new Set(groups.map((g) => g.key));
    const daily: Record<string, number> = {};
    for (const [key, value] of Object.entries(dto.servings)) {
      if (!keys.has(key)) throw new BadRequestException(`El grupo ${key} no existe en este sistema`);
      const servings = Number(value);
      if (!Number.isFinite(servings) || servings < 0 || servings > 40) {
        throw new BadRequestException("Las porciones deben estar entre 0 y 40");
      }
      if (servings > 0) daily[key] = round(servings, 1);
    }
    await this.saveDaily(id, daily);
    return this.detail(nutritionistId, id);
  }

  async distribute(nutritionistId: string, id: string) {
    const plan = await this.editable(nutritionistId, id);
    await this.distributeInto(plan, this.dailyServings(plan));
    return this.detail(nutritionistId, id);
  }

  // Reemplaza la lista de tiempos de comida. Los que se conservan mantienen su menú.
  async setMeals(nutritionistId: string, id: string, dto: MealsDto) {
    const plan = await this.editable(nutritionistId, id);
    if (dto.meals.length === 0) throw new BadRequestException("El plan necesita al menos un tiempo de comida");
    const existing = new Set(plan.meals.map((m) => m.id));
    const keep = dto.meals.filter((m) => m.id && existing.has(m.id)).map((m) => m.id!);

    await this.prisma.$transaction(async (tx) => {
      await tx.mealPlanMeal.deleteMany({ where: { planId: id, id: { notIn: keep } } });
      for (const [i, meal] of dto.meals.entries()) {
        const data = {
          name: meal.name.trim(),
          time: meal.time ?? null,
          notes: meal.notes ?? null,
          sortOrder: i,
          exchanges: cleanServings(meal.exchanges ?? {}),
        };
        if (meal.id && existing.has(meal.id)) {
          await tx.mealPlanMeal.update({ where: { id: meal.id }, data });
        } else {
          await tx.mealPlanMeal.create({ data: { ...data, planId: id } });
        }
      }
    });
    return this.detail(nutritionistId, id);
  }

  async addItem(nutritionistId: string, id: string, mealId: string, dto: ItemDto) {
    const plan = await this.editable(nutritionistId, id);
    const meal = plan.meals.find((m) => m.id === mealId);
    if (!meal) throw new NotFoundException("Tiempo de comida no encontrado");

    const sources = [dto.foodId, dto.recipeId, dto.customName].filter(Boolean).length;
    if (sources !== 1) throw new BadRequestException("Indica un alimento, una receta o un nombre libre");

    if (dto.foodId) {
      const food = await this.prisma.food.findFirst({
        where: { id: dto.foodId, ...this.catalog.visibleFoods(nutritionistId) },
      });
      if (!food) throw new BadRequestException("El alimento no existe");
    }
    if (dto.recipeId) {
      const recipe = await this.prisma.recipe.findFirst({
        where: { id: dto.recipeId, OR: [{ nutritionistId }, { nutritionistId: null }] },
      });
      if (!recipe) throw new BadRequestException("La receta no existe");
    }
    if (dto.substituteOfId && !meal.items.some((i) => i.id === dto.substituteOfId && !i.substituteOfId)) {
      throw new BadRequestException("La sustitución debe apuntar a un alimento principal del mismo tiempo de comida");
    }

    await this.prisma.mealPlanItem.create({
      data: { ...dto, mealId, sortOrder: meal.items.length },
    });
    return this.detail(nutritionistId, id);
  }

  async updateItem(nutritionistId: string, id: string, itemId: string, dto: UpdateItemDto) {
    const plan = await this.editable(nutritionistId, id);
    this.findItem(plan, itemId);
    await this.prisma.mealPlanItem.update({ where: { id: itemId }, data: dto });
    return this.detail(nutritionistId, id);
  }

  async removeItem(nutritionistId: string, id: string, itemId: string) {
    const plan = await this.editable(nutritionistId, id);
    this.findItem(plan, itemId);
    await this.prisma.mealPlanItem.delete({ where: { id: itemId } });
    return this.detail(nutritionistId, id);
  }

  async update(nutritionistId: string, id: string, dto: UpdateMealPlanDto) {
    // Título, objetivos y recomendaciones se pueden corregir aun aprobado (no cambian el cálculo).
    const plan = await this.load(nutritionistId, id);
    if (plan.status === MealPlanStatus.ARCHIVED) throw new ConflictException("El plan está archivado");
    await this.prisma.mealPlan.update({
      where: { id },
      data: { ...dto, objectives: dto.objectives?.map((o) => o.trim()).filter(Boolean) },
    });
    return this.detail(nutritionistId, id);
  }

  // ─── Aprobación ───

  async approve(nutritionistId: string, id: string, dto: ApproveDto) {
    const plan = await this.editable(nutritionistId, id);
    const system = await this.prisma.exchangeSystem.findUniqueOrThrow({
      where: { id: plan.systemId },
      include: { groups: true },
    });
    const { validation } = this.present(plan, system);
    if (!validation.ready && !dto.acknowledgeWarnings) {
      throw new ConflictException({
        message: "El plan tiene diferencias con el objetivo. Revísalas o confirma que lo apruebas así.",
        validation,
      });
    }

    await this.prisma.$transaction([
      // Solo un plan aprobado vigente por paciente: los anteriores se archivan.
      this.prisma.mealPlan.updateMany({
        where: { patientId: plan.patientId, status: MealPlanStatus.APPROVED, id: { not: id } },
        data: { status: MealPlanStatus.ARCHIVED },
      }),
      this.prisma.mealPlan.update({ where: { id }, data: { status: MealPlanStatus.APPROVED, approvedAt: new Date() } }),
    ]);
    return this.detail(nutritionistId, id);
  }

  async reopen(nutritionistId: string, id: string) {
    const plan = await this.load(nutritionistId, id);
    if (plan.status !== MealPlanStatus.APPROVED) throw new ConflictException("Solo se puede reabrir un plan aprobado");
    await this.prisma.mealPlan.update({ where: { id }, data: { status: MealPlanStatus.DRAFT, approvedAt: null } });
    return this.detail(nutritionistId, id);
  }

  // Copia un plan como borrador nuevo (útil para ajustar en un seguimiento).
  async duplicate(nutritionistId: string, id: string, consultationId?: string) {
    const plan = await this.load(nutritionistId, id);
    if (consultationId) {
      const c = await this.prisma.consultation.findFirst({ where: { id: consultationId, patientId: plan.patientId } });
      if (!c) throw new BadRequestException("La consulta no es de este paciente");
    }
    const {
      id: _id,
      patient: _patient,
      exchanges,
      meals,
      createdAt: _c,
      updatedAt: _u,
      approvedAt: _a,
      status: _s,
      ...rest
    } = plan;

    const copy = await this.prisma.$transaction(async (tx) => {
      const created = await tx.mealPlan.create({
        data: {
          ...rest,
          activityDetail: rest.activityDetail === null ? Prisma.DbNull : (rest.activityDetail as Prisma.InputJsonValue),
          consultationId: consultationId ?? rest.consultationId,
          title: `${plan.title} (ajuste)`,
          status: MealPlanStatus.DRAFT,
          exchanges: { create: exchanges.map((e) => ({ groupKey: e.groupKey, servings: e.servings })) },
        },
      });
      for (const meal of meals) {
        const newMeal = await tx.mealPlanMeal.create({
          data: {
            planId: created.id,
            name: meal.name,
            time: meal.time,
            sortOrder: meal.sortOrder,
            exchanges: meal.exchanges ?? {},
            notes: meal.notes,
          },
        });
        const idMap = new Map<string, string>();
        // Primero los principales, luego las sustituciones que apuntan a ellos.
        const ordered = [...meal.items].sort((a, b) => Number(!!a.substituteOfId) - Number(!!b.substituteOfId));
        for (const item of ordered) {
          const createdItem = await tx.mealPlanItem.create({
            data: {
              mealId: newMeal.id,
              foodId: item.foodId,
              recipeId: item.recipeId,
              customName: item.customName,
              servings: item.servings,
              notes: item.notes,
              sortOrder: item.sortOrder,
              substituteOfId: item.substituteOfId ? idMap.get(item.substituteOfId) : null,
            },
          });
          idMap.set(item.id, createdItem.id);
        }
      }
      return created;
    });
    return this.detail(nutritionistId, copy.id);
  }

  async remove(nutritionistId: string, id: string) {
    await this.load(nutritionistId, id);
    await this.prisma.mealPlan.delete({ where: { id } });
  }

  // ─── Auxiliares ───

  async load(nutritionistId: string, id: string): Promise<FullPlan> {
    const plan = await this.prisma.mealPlan.findFirst({ where: { id, nutritionistId }, include: PLAN_INCLUDE });
    if (!plan) throw new NotFoundException("Plan no encontrado");
    return plan;
  }

  private async editable(nutritionistId: string, id: string) {
    const plan = await this.load(nutritionistId, id);
    if (plan.status === MealPlanStatus.APPROVED) {
      throw new ConflictException("El plan está aprobado. Reábrelo para hacer cambios.");
    }
    if (plan.status === MealPlanStatus.ARCHIVED) {
      throw new ConflictException("El plan está archivado. Duplícalo para crear uno nuevo.");
    }
    return plan;
  }

  private findItem(plan: FullPlan, itemId: string) {
    const item = plan.meals.flatMap((m) => m.items).find((i) => i.id === itemId);
    if (!item) throw new NotFoundException("Alimento del menú no encontrado");
    return item;
  }

  private targetMacros(plan: FullPlan): Macros {
    return macroGrams(plan.targetKcal, plan.choPct, plan.proPct, plan.fatPct);
  }

  private dailyServings(plan: FullPlan): Record<string, number> {
    return Object.fromEntries(plan.exchanges.map((e) => [e.groupKey, num(e.servings)!]));
  }

  private async saveDaily(planId: string, daily: Record<string, number>) {
    await this.prisma.$transaction([
      this.prisma.mealPlanExchange.deleteMany({ where: { planId } }),
      this.prisma.mealPlanExchange.createMany({
        data: Object.entries(daily).map(([groupKey, servings]) => ({ planId, groupKey, servings })),
      }),
    ]);
  }

  private async distributeInto(plan: FullPlan, daily: Record<string, number>) {
    const perMeal = distributeExchanges(daily, mealShares(plan.meals.map((m) => m.name)));
    await this.prisma.$transaction(
      plan.meals.map((meal, i) => this.prisma.mealPlanMeal.update({ where: { id: meal.id }, data: { exchanges: perMeal[i] } })),
    );
  }

  // Arma la respuesta con objetivos, totales y validación.
  present(plan: FullPlan, system: { groups: Prisma.ExchangeGroupGetPayload<object>[] }) {
    const groups = system.groups.map(groupValue);
    const target = this.targetMacros(plan);
    const daily = this.dailyServings(plan);
    const exchangeTotals = totalsFromServings(groups, daily);

    const menuTotals = { kcal: 0, choG: 0, proG: 0, fatG: 0 };
    const menuExchanges: Record<string, number> = {};
    const assigned: Record<string, number> = {};

    const meals = plan.meals.map((meal) => {
      const mealExchanges = (meal.exchanges ?? {}) as Record<string, number>;
      for (const [k, v] of Object.entries(mealExchanges)) assigned[k] = (assigned[k] ?? 0) + Number(v);

      const mealMenu = { kcal: 0, choG: 0, proG: 0, fatG: 0 };
      const mealMenuExchanges: Record<string, number> = {};
      const items = meal.items.map((item) => {
        const values = itemValues(item);
        if (!item.substituteOfId) {
          for (const k of ["kcal", "choG", "proG", "fatG"] as const) mealMenu[k] += values.macros[k];
          for (const [k, v] of Object.entries(values.exchanges)) mealMenuExchanges[k] = (mealMenuExchanges[k] ?? 0) + v;
        }
        return { ...item, recipe: item.recipe ? { id: item.recipe.id, name: item.recipe.name } : null, ...values };
      });

      for (const k of ["kcal", "choG", "proG", "fatG"] as const) menuTotals[k] += mealMenu[k];
      for (const [k, v] of Object.entries(mealMenuExchanges)) menuExchanges[k] = (menuExchanges[k] ?? 0) + v;

      return {
        ...meal,
        exchanges: mealExchanges,
        items,
        plannedTotals: totalsFromServings(groups, mealExchanges),
        menuTotals: roundMacros(mealMenu),
        menuExchanges: roundRecord(mealMenuExchanges),
      };
    });

    const roundedMenu = roundMacros(menuTotals);
    const exchangeChecks = compare(target, exchangeTotals);
    const hasMenu = plan.meals.some((m) => m.items.length > 0);
    const menuChecks = hasMenu ? compare(target, roundedMenu) : [];

    // Grupos cuya suma por tiempos de comida no coincide con el total diario.
    const keys = new Set([...Object.keys(daily), ...Object.keys(assigned)]);
    const distributionIssues = [...keys]
      .map((key) => ({ key, daily: daily[key] ?? 0, assigned: round(assigned[key] ?? 0) }))
      .filter((d) => Math.abs(d.daily - d.assigned) > 0.01);

    const warnings: string[] = [];
    if (exchangeChecks.some((c) => !c.ok)) warnings.push("Los intercambios no cubren el objetivo dentro de la tolerancia.");
    if (distributionIssues.length) warnings.push("La distribución por tiempos de comida no suma el total diario.");
    if (!hasMenu) warnings.push("El menú aún no tiene alimentos.");
    else if (menuChecks.some((c) => !c.ok)) warnings.push("El menú no coincide con el objetivo dentro de la tolerancia.");

    const { patient, ...rest } = plan;
    return {
      ...rest,
      patient: {
        id: patient.id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        sex: patient.sex,
        birthDate: patient.birthDate,
        age: ageFrom(patient.birthDate),
      },
      allowedFoodSources: foodSourcesFor(plan.exchangeMode),
      target,
      // Proteína por kg del mismo peso con que se calcularon las calorías.
      proteinPerKg: (plan.energyWeightKg ?? plan.weightKg) ? round(target.proG / num(plan.energyWeightKg ?? plan.weightKg)!) : null,
      energyWeight:
        plan.weightKg && plan.calorieMethod === CalorieMethod.AUTOMATIC
          ? energyWeight(num(plan.weightKg)!, num(plan.heightCm), (plan.weightBasis ?? "AUTO") as WeightBasis)
          : null,
      daily,
      exchangeTotals,
      menuTotals: roundedMenu,
      menuExchanges: roundRecord(menuExchanges),
      meals,
      validation: {
        exchangeChecks,
        menuChecks,
        distributionIssues,
        warnings,
        ready: warnings.length === 0,
      },
    };
  }
}

export function groupValue(g: Prisma.ExchangeGroupGetPayload<object>): GroupValue {
  return { key: g.key, family: g.family, kcal: num(g.kcal)!, choG: num(g.choG)!, proG: num(g.proG)!, fatG: num(g.fatG)! };
}

function cleanServings(input: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(input)) {
    const n = Number(v);
    if (!/^[A-Z_]{2,30}$/.test(k)) throw new BadRequestException(`Grupo no válido: ${k}`);
    if (!Number.isFinite(n) || n < 0 || n > 40) throw new BadRequestException("Las porciones deben estar entre 0 y 40");
    if (n > 0) out[k] = round(n, 1);
  }
  return out;
}

function roundMacros(m: Macros): Macros {
  return { kcal: Math.round(m.kcal), choG: round(m.choG), proG: round(m.proG), fatG: round(m.fatG) };
}

function roundRecord(r: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, round(v, 2)]));
}

// Aporte de un ítem del menú: alimento × porciones o receta × raciones.
function itemValues(item: FullPlan["meals"][number]["items"][number]) {
  const servings = num(item.servings)!;
  if (item.food) {
    const f = item.food;
    return {
      macros: {
        kcal: num(f.kcal)! * servings,
        choG: num(f.choG)! * servings,
        proG: num(f.proG)! * servings,
        fatG: num(f.fatG)! * servings,
      },
      exchanges: f.group ? { [f.group.key]: servings } : {},
    };
  }
  if (item.recipe) {
    const r = withRecipeTotals(item.recipe);
    return {
      macros: {
        kcal: r.perServing.kcal * servings,
        choG: r.perServing.choG * servings,
        proG: r.perServing.proG * servings,
        fatG: r.perServing.fatG * servings,
      },
      exchanges: Object.fromEntries(Object.entries(r.exchangesPerServing).map(([k, v]) => [k, v * servings])),
    };
  }
  return { macros: { kcal: 0, choG: 0, proG: 0, fatG: 0 }, exchanges: {} };
}
