// Cálculos nutricionales puros, sin dependencias.
// El dashboard tiene una copia de este archivo (src/app/core/calc.ts) para mostrar
// los resultados mientras se escribe; si cambias una fórmula, cambia las dos.

export type Sex = "FEMALE" | "MALE";
export type Equation = "MIFFLIN_ST_JEOR" | "HARRIS_BENEDICT" | "FAO_WHO" | "OWEN" | "KATCH_MCARDLE" | "KCAL_PER_KG";

export const EQUATIONS: { value: Equation; label: string; needs: string }[] = [
  { value: "MIFFLIN_ST_JEOR", label: "Mifflin-St Jeor", needs: "Peso, talla, edad y sexo" },
  { value: "HARRIS_BENEDICT", label: "Harris-Benedict (revisada)", needs: "Peso, talla, edad y sexo" },
  { value: "FAO_WHO", label: "FAO/OMS/UNU", needs: "Peso, edad y sexo" },
  { value: "OWEN", label: "Owen", needs: "Peso y sexo" },
  { value: "KATCH_MCARDLE", label: "Katch-McArdle", needs: "Peso y % de grasa" },
  { value: "KCAL_PER_KG", label: "Kcal por kg de peso", needs: "Peso y kcal/kg" },
];

// Factores de estrés o condición clínica que multiplican el gasto (Long y col.).
export const STRESS_FACTORS = [
  { value: 1, label: "Sin condición especial" },
  { value: 1.1, label: "Cirugía menor o infección leve" },
  { value: 1.2, label: "Cirugía mayor o infección moderada" },
  { value: 1.3, label: "Fracturas o trauma múltiple" },
  { value: 1.4, label: "Sepsis o infección grave" },
  { value: 1.6, label: "Quemaduras extensas" },
];

// Calorías adicionales por etapa fisiológica (IOM).
export const PHYSIOLOGICAL_EXTRAS = [
  { value: "NONE", label: "Ninguna", kcal: 0 },
  { value: "PREGNANCY_1", label: "Embarazo, 1.er trimestre", kcal: 0 },
  { value: "PREGNANCY_2", label: "Embarazo, 2.º trimestre", kcal: 340 },
  { value: "PREGNANCY_3", label: "Embarazo, 3.er trimestre", kcal: 452 },
  { value: "LACTATION_1", label: "Lactancia, 0 a 6 meses", kcal: 330 },
  { value: "LACTATION_2", label: "Lactancia, 7 a 12 meses", kcal: 400 },
] as const;

export type PhysiologicalStage = (typeof PHYSIOLOGICAL_EXTRAS)[number]["value"];

// Ejercicios frecuentes con su gasto en MET (Compendio de Actividades Físicas).
export const EXERCISES = [
  { value: "WALK", label: "Caminar a paso moderado", met: 3.5 },
  { value: "WALK_FAST", label: "Caminar rápido", met: 4.3 },
  { value: "RUN", label: "Trotar o correr", met: 8 },
  { value: "CYCLING", label: "Bicicleta o spinning", met: 7 },
  { value: "SWIM", label: "Natación", met: 6 },
  { value: "WEIGHTS", label: "Pesas o entrenamiento de fuerza", met: 5 },
  { value: "HIIT", label: "Funcional o HIIT", met: 8 },
  { value: "DANCE", label: "Baile o zumba", met: 6.5 },
  { value: "YOGA", label: "Yoga o pilates", met: 3 },
  { value: "SOCCER", label: "Fútbol u otro deporte de equipo", met: 7 },
  { value: "OTHER", label: "Otro", met: 5 },
];

export interface ExerciseEntry {
  type: string;
  met: number;
  daysPerWeek: number;
  minutes: number;
}

// Gasto diario promedio del ejercicio: MET × peso × horas por semana ÷ 7, sin el gasto basal de ese tiempo
// (se resta 1 MET porque ese tiempo ya está en el gasto en reposo).
export function exerciseKcalPerDay(weightKg: number, exercises: ExerciseEntry[]): number {
  const weekly = exercises.reduce((sum, e) => sum + Math.max(e.met - 1, 0) * weightKg * ((e.daysPerWeek * e.minutes) / 60), 0);
  return Math.round(weekly / 7);
}

export const ACTIVITY_FACTORS = [
  { value: 1.2, label: "Sedentario" },
  { value: 1.375, label: "Actividad ligera" },
  { value: 1.55, label: "Actividad moderada" },
  { value: 1.725, label: "Actividad intensa" },
  { value: 1.9, label: "Actividad muy intensa" },
];

export function round(value: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function ageFrom(birthDate: Date | string, on: Date = new Date()): number {
  const birth = typeof birthDate === "string" ? new Date(birthDate) : birthDate;
  let age = on.getUTCFullYear() - birth.getUTCFullYear();
  const m = on.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

// ─── Antropometría ───────────────────────────

export interface AnthropometryInput {
  sex: Sex;
  ageYears: number;
  weightKg?: number | null;
  heightCm?: number | null;
  waistCm?: number | null;
  hipCm?: number | null;
  bodyFatPct?: number | null;
  previousWeightKg?: number | null;
  initialWeightKg?: number | null;
  // Peso habitual referido por el paciente (antes de su cambio reciente).
  usualWeightKg?: number | null;
}

export interface Indicator {
  key: string;
  label: string;
  value: number;
  unit: string;
  // Interpretación y si representa un riesgo.
  status?: string;
  alert?: boolean;
  // Fórmula usada, para mostrarla junto al resultado.
  formula?: string;
}

// Clasificación del IMC para adultos según la OMS.
export function bmiCategory(bmi: number): { label: string; alert: boolean } {
  if (bmi < 16) return { label: "Delgadez severa", alert: true };
  if (bmi < 17) return { label: "Delgadez moderada", alert: true };
  if (bmi < 18.5) return { label: "Bajo peso", alert: true };
  if (bmi < 25) return { label: "Normal", alert: false };
  if (bmi < 30) return { label: "Sobrepeso", alert: true };
  if (bmi < 35) return { label: "Obesidad grado I", alert: true };
  if (bmi < 40) return { label: "Obesidad grado II", alert: true };
  return { label: "Obesidad grado III", alert: true };
}

export function anthropometry(input: AnthropometryInput): Indicator[] {
  const out: Indicator[] = [];
  const { sex, weightKg: w, heightCm: h, waistCm: waist, hipCm: hip, bodyFatPct: fat } = input;
  const adult = input.ageYears >= 18;

  if (w && h) {
    const m = h / 100;
    const bmi = w / (m * m);
    const cat = bmiCategory(bmi);
    out.push({
      key: "bmi",
      label: "IMC",
      value: round(bmi),
      unit: "kg/m²",
      status: adult ? cat.label : "Usar percentiles para menores de 18 años",
      alert: adult ? cat.alert : undefined,
    });
    // Peso ideal con IMC 22 y rango saludable (IMC 18.5–24.9).
    const ideal = 22 * m * m;
    out.push({ key: "idealWeight", label: "Peso ideal (IMC 22)", value: round(ideal), unit: "kg", formula: "22 × talla² (m)" });
    // Hamwi: 48 kg (hombres) o 45.5 kg (mujeres) para 152.4 cm, más 2.7 / 2.2 kg por cada 2.54 cm adicionales.
    const hamwi = input.sex === "MALE" ? 48 + 1.063 * (h - 152.4) : 45.5 + 0.866 * (h - 152.4);
    out.push({
      key: "idealWeightHamwi",
      label: "Peso ideal (Hamwi)",
      value: round(hamwi),
      unit: "kg",
      formula: input.sex === "MALE" ? "48 + 2.7 kg por pulgada sobre 1.52 m" : "45.5 + 2.2 kg por pulgada sobre 1.52 m",
    });
    out.push({
      key: "idealWeightPct",
      label: "Porcentaje de peso ideal",
      value: round((w / ideal) * 100),
      unit: "%",
      formula: "peso actual ÷ peso ideal × 100",
      status: w / ideal >= 1.2 ? "Sobre el 120 %" : w / ideal < 0.9 ? "Bajo el 90 %" : "Adecuado",
      alert: w / ideal >= 1.2 || w / ideal < 0.9,
    });
    out.push({
      key: "healthyRange",
      label: "Rango de peso saludable",
      value: round(18.5 * m * m),
      unit: `– ${round(24.9 * m * m)} kg`,
      formula: "IMC 18.5 a 24.9 × talla² (m)",
    });
    if (bmi >= 30) {
      // Peso ajustado para obesidad: ideal + 25 % del exceso.
      out.push({
        key: "adjustedWeight",
        label: "Peso ajustado",
        value: round(ideal + 0.25 * (w - ideal)),
        unit: "kg",
        formula: "peso ideal + 0.25 × (peso actual − peso ideal)",
      });
    }
  }

  if (waist) {
    const high = sex === "MALE" ? 102 : 88;
    const increased = sex === "MALE" ? 94 : 80;
    out.push({
      key: "waist",
      label: "Circunferencia de cintura",
      value: waist,
      unit: "cm",
      status: waist >= high ? "Riesgo muy aumentado" : waist >= increased ? "Riesgo aumentado" : "Sin riesgo aumentado",
      alert: waist >= increased,
    });
  }

  if (waist && hip) {
    const whr = waist / hip;
    const limit = sex === "MALE" ? 0.9 : 0.85;
    out.push({
      key: "whr",
      label: "Índice cintura-cadera",
      value: round(whr, 2),
      unit: "",
      status: whr > limit ? "Riesgo cardiometabólico" : "Adecuado",
      alert: whr > limit,
    });
  }

  if (waist && h) {
    const whtr = waist / h;
    out.push({
      key: "whtr",
      label: "Índice cintura-talla",
      value: round(whtr, 2),
      unit: "",
      status: whtr >= 0.5 ? "Riesgo aumentado" : "Adecuado",
      alert: whtr >= 0.5,
    });
  }

  if (w && fat) {
    const fatMass = (w * fat) / 100;
    out.push({ key: "fatMass", label: "Masa grasa", value: round(fatMass), unit: "kg" });
    out.push({ key: "leanMass", label: "Masa libre de grasa", value: round(w - fatMass), unit: "kg" });
  }

  if (w && input.usualWeightKg) {
    const pct = (w / input.usualWeightKg) * 100;
    const loss = ((input.usualWeightKg - w) / input.usualWeightKg) * 100;
    // Porcentaje de peso habitual (Blackburn): 85–95 % leve, 75–84 % moderada, < 75 % grave.
    const status =
      pct < 75 ? "Desnutrición grave" : pct < 85 ? "Desnutrición moderada" : pct < 95 ? "Desnutrición leve" : loss > 0 ? "Pérdida no significativa" : "Sin pérdida";
    out.push({
      key: "usualWeightPct",
      label: "Porcentaje de peso habitual",
      value: round(pct),
      unit: "%",
      formula: "peso actual ÷ peso habitual × 100",
      status,
      alert: pct < 95,
    });
    out.push({
      key: "weightLossPct",
      label: "Cambio respecto al peso habitual",
      value: round(-loss),
      unit: "%",
      formula: "(peso actual − peso habitual) ÷ peso habitual × 100",
    });
  }

  if (w && input.previousWeightKg) {
    const diff = w - input.previousWeightKg;
    out.push({ key: "weightChange", label: "Cambio desde la consulta anterior", value: round(diff), unit: "kg" });
  }
  if (w && input.initialWeightKg) {
    const diff = w - input.initialWeightKg;
    out.push({
      key: "weightChangeTotal",
      label: "Cambio desde el inicio",
      value: round(diff),
      unit: `kg (${round((diff / input.initialWeightKg) * 100)} %)`,
    });
  }

  return out;
}

// ─── Peso para el cálculo de energía ─────────

export type WeightBasis = "AUTO" | "ACTUAL" | "IDEAL" | "ADJUSTED";

export const WEIGHT_BASES: { value: WeightBasis; label: string }[] = [
  { value: "AUTO", label: "Automático según IMC" },
  { value: "IDEAL", label: "Peso ideal" },
  { value: "ADJUSTED", label: "Peso ajustado" },
  { value: "ACTUAL", label: "Peso actual" },
];

export interface EnergyWeight {
  basis: Exclude<WeightBasis, "AUTO">;
  weightKg: number;
  explanation: string;
}

// Peso con el que se calculan las calorías. Regla automática: IMC < 30 → peso ideal (IMC 22);
// IMC ≥ 30 → peso ajustado = ideal + 0.25 × (actual − ideal). Sin talla se usa el peso actual.
export function energyWeight(weightKg: number, heightCm: number | null | undefined, basis: WeightBasis = "AUTO"): EnergyWeight {
  if (!heightCm) {
    return { basis: "ACTUAL", weightKg, explanation: "Peso actual (sin talla no se puede calcular el peso ideal)" };
  }
  const m = heightCm / 100;
  const bmi = weightKg / (m * m);
  const ideal = round(22 * m * m);
  const adjusted = round(ideal + 0.25 * (weightKg - ideal));
  const chosen = basis === "AUTO" ? (bmi >= 30 ? "ADJUSTED" : "IDEAL") : basis;
  const reason = basis === "AUTO" ? ` porque el IMC es ${round(bmi)}${bmi >= 30 ? " (≥ 30)" : " (< 30)"}` : "";
  if (chosen === "IDEAL") return { basis: "IDEAL", weightKg: ideal, explanation: `Peso ideal ${ideal} kg (22 × talla²)${reason}` };
  if (chosen === "ADJUSTED") {
    return { basis: "ADJUSTED", weightKg: adjusted, explanation: `Peso ajustado ${adjusted} kg (ideal + 0.25 × (actual − ideal))${reason}` };
  }
  return { basis: "ACTUAL", weightKg, explanation: `Peso actual ${weightKg} kg` };
}

// ─── Energía ─────────────────────────────────

export interface EnergyInput {
  equation: Equation;
  sex: Sex;
  ageYears: number;
  weightKg: number;
  heightCm?: number | null;
  bodyFatPct?: number | null;
  kcalPerKg?: number | null;
  activityFactor?: number | null;
  // Factor por condición clínica (1 = sin condición).
  stressFactor?: number | null;
  // Gasto diario del ejercicio, aparte del factor de actividad para no contarlo dos veces.
  exerciseKcal?: number | null;
  // Calorías adicionales por embarazo o lactancia.
  physiologicalKcal?: number | null;
  adjustmentPct?: number | null;
  adjustmentKcal?: number | null;
}

export interface EnergyResult {
  restingKcal: number;
  totalKcal: number;
  targetKcal: number;
}

// FAO/OMS/UNU: ecuaciones por sexo y rango de edad (solo peso).
function faoWho(sex: Sex, age: number, w: number): number {
  const male: [number, number, number][] = [
    [3, 59.512, -30.4],
    [10, 22.706, 504.3],
    [18, 17.686, 658.2],
    [30, 15.057, 692.2],
    [60, 11.472, 873.1],
    [Infinity, 11.711, 587.7],
  ];
  const female: [number, number, number][] = [
    [3, 58.317, -31.1],
    [10, 20.315, 485.9],
    [18, 13.384, 692.6],
    [30, 14.818, 486.6],
    [60, 8.126, 845.6],
    [Infinity, 9.082, 658.5],
  ];
  const [, a, b] = (sex === "MALE" ? male : female).find(([limit]) => age < limit)!;
  return a * w + b;
}

export class EnergyInputError extends Error {}

export function restingEnergy(input: EnergyInput): number {
  const { sex, ageYears: age, weightKg: w } = input;
  const h = input.heightCm ?? 0;
  const male = sex === "MALE";

  switch (input.equation) {
    case "MIFFLIN_ST_JEOR":
      if (!h) throw new EnergyInputError("Mifflin-St Jeor necesita la talla");
      return 10 * w + 6.25 * h - 5 * age + (male ? 5 : -161);
    case "HARRIS_BENEDICT":
      if (!h) throw new EnergyInputError("Harris-Benedict necesita la talla");
      // Revisión de Roza y Shizgal (1984).
      return male ? 88.362 + 13.397 * w + 4.799 * h - 5.677 * age : 447.593 + 9.247 * w + 3.098 * h - 4.33 * age;
    case "FAO_WHO":
      return faoWho(sex, age, w);
    case "OWEN":
      return male ? 879 + 10.2 * w : 795 + 7.18 * w;
    case "KATCH_MCARDLE": {
      if (!input.bodyFatPct) throw new EnergyInputError("Katch-McArdle necesita el porcentaje de grasa");
      const lean = w * (1 - input.bodyFatPct / 100);
      return 370 + 21.6 * lean;
    }
    case "KCAL_PER_KG":
      if (!input.kcalPerKg) throw new EnergyInputError("Indica las kcal por kg de peso");
      return w * input.kcalPerKg;
  }
}

export function energy(input: EnergyInput): EnergyResult {
  const resting = restingEnergy(input);
  // Con kcal/kg el valor ya es el requerimiento total.
  const factor = input.equation === "KCAL_PER_KG" ? 1 : (input.activityFactor ?? 1);
  const total = resting * factor * (input.stressFactor ?? 1) + (input.exerciseKcal ?? 0) + (input.physiologicalKcal ?? 0);
  let target = total;
  if (input.adjustmentPct) target = total * (1 + input.adjustmentPct / 100);
  if (input.adjustmentKcal) target += input.adjustmentKcal;
  return { restingKcal: Math.round(resting), totalKcal: Math.round(total), targetKcal: Math.round(target) };
}

// ─── Macronutrientes ─────────────────────────

export interface Macros {
  kcal: number;
  choG: number;
  proG: number;
  fatG: number;
}

export function macroGrams(kcal: number, choPct: number, proPct: number, fatPct: number): Macros {
  return {
    kcal,
    choG: round((kcal * choPct) / 100 / 4, 0),
    proG: round((kcal * proPct) / 100 / 4, 0),
    fatG: round((kcal * fatPct) / 100 / 9, 0),
  };
}

// ─── Intercambios ────────────────────────────

export interface GroupValue {
  key: string;
  family: string;
  kcal: number;
  choG: number;
  proG: number;
  fatG: number;
}

export function totalsFromServings(groups: GroupValue[], servings: Record<string, number>): Macros {
  const total = { kcal: 0, choG: 0, proG: 0, fatG: 0 };
  for (const g of groups) {
    const n = servings[g.key] ?? 0;
    total.kcal += g.kcal * n;
    total.choG += g.choG * n;
    total.proG += g.proG * n;
    total.fatG += g.fatG * n;
  }
  return { kcal: Math.round(total.kcal), choG: round(total.choG), proG: round(total.proG), fatG: round(total.fatG) };
}

function half(value: number): number {
  return Math.max(0, Math.round(value * 2) / 2);
}

// Sugiere intercambios diarios para acercarse a los objetivos de macros.
// Método clásico: se fijan lácteos, vegetales y frutas; el resto del carbohidrato
// va a cereales, la proteína restante a carnes y la grasa restante a grasas.
// Es solo un punto de partida: la nutricionista ajusta las cantidades.
export function suggestExchanges(groups: GroupValue[], target: Macros): Record<string, number> {
  const byFamily = (family: string) => groups.find((g) => g.family === family);
  const milk = groups.find((g) => g.key === "MILK_SKIM") ?? byFamily("MILK");
  const meat = groups.find((g) => g.key === "MEAT_LEAN") ?? byFamily("MEAT");
  const vegetables = byFamily("VEGETABLES");
  const fruits = byFamily("FRUITS");
  const cereals = byFamily("CEREALS");
  const fat = byFamily("FAT");

  const result: Record<string, number> = {};
  const used = { choG: 0, proG: 0, fatG: 0 };
  const add = (g: GroupValue | undefined, n: number) => {
    if (!g || n <= 0) return;
    result[g.key] = (result[g.key] ?? 0) + n;
    used.choG += g.choG * n;
    used.proG += g.proG * n;
    used.fatG += g.fatG * n;
  };

  // Base según la energía: más energía, algo más de lácteos y frutas.
  add(milk, target.kcal >= 1800 ? 2 : 1.5);
  add(vegetables, target.kcal >= 1600 ? 5 : 4);
  add(fruits, target.kcal >= 2200 ? 4 : target.kcal >= 1500 ? 3 : 2);

  if (cereals && cereals.choG > 0) add(cereals, half((target.choG - used.choG) / cereals.choG));
  if (meat && meat.proG > 0) add(meat, half((target.proG - used.proG) / meat.proG));
  if (fat && fat.fatG > 0) add(fat, half((target.fatG - used.fatG) / fat.fatG));

  return result;
}

export const DEFAULT_MEALS = [
  { name: "Desayuno", time: "07:00", share: 0.25 },
  { name: "Merienda AM", time: "10:00", share: 0.1 },
  { name: "Almuerzo", time: "12:30", share: 0.3 },
  { name: "Merienda PM", time: "16:00", share: 0.1 },
  { name: "Cena", time: "19:00", share: 0.25 },
];

// Reparte los intercambios diarios entre los tiempos de comida según su peso.
// Se reparten porciones enteras (las medias porciones solo si el total las tiene)
// y la suma siempre coincide con el total diario.
export function distributeExchanges(
  daily: Record<string, number>,
  shares: number[],
): Record<string, number>[] {
  const totalShare = shares.reduce((a, b) => a + b, 0) || 1;
  const meals = shares.map(() => ({}) as Record<string, number>);
  for (const [key, servings] of Object.entries(daily)) {
    const whole = Math.floor(servings);
    const rest = Math.round((servings - whole) * 2) / 2;
    const raw = shares.map((s) => (whole * s) / totalShare);
    const counts = raw.map(Math.floor);
    let remaining = whole - counts.reduce((a, b) => a + b, 0);
    // Las porciones que sobran van a los tiempos con mayor residuo (y, a igualdad, mayor peso).
    const order = raw
      .map((r, i) => ({ i, rest: r - counts[i], share: shares[i] }))
      .sort((a, b) => b.rest - a.rest || b.share - a.share);
    for (const { i } of order) {
      if (remaining <= 0) break;
      counts[i]++;
      remaining--;
    }
    if (rest > 0) {
      const target = shares.indexOf(Math.max(...shares));
      counts[target] += rest;
    }
    counts.forEach((n, i) => {
      if (n > 0) meals[i][key] = n;
    });
  }
  return meals;
}

// ─── Validación ──────────────────────────────

export interface Check {
  key: "kcal" | "choG" | "proG" | "fatG";
  label: string;
  target: number;
  actual: number;
  diffPct: number;
  ok: boolean;
}

const LABELS = { kcal: "Energía", choG: "Carbohidratos", proG: "Proteínas", fatG: "Grasas" } as const;

// Compara contra el objetivo. Tolerancia: ±5 % en energía y ±10 % en macronutrientes.
export function compare(target: Macros, actual: Macros): Check[] {
  return (["kcal", "choG", "proG", "fatG"] as const).map((key) => {
    const t = target[key];
    const a = actual[key];
    const diffPct = t ? round(((a - t) / t) * 100) : 0;
    const tolerance = key === "kcal" ? 5 : 10;
    return { key, label: LABELS[key], target: t, actual: a, diffPct, ok: Math.abs(diffPct) <= tolerance };
  });
}

// ─── Composición corporal ────────────────────

export type BodyFatMethod = "DURNIN_WOMERSLEY" | "JACKSON_POLLOCK_3" | "NAVY" | "DEURENBERG";

export const BODY_FAT_METHODS: { value: BodyFatMethod; label: string; needs: string }[] = [
  { value: "DURNIN_WOMERSLEY", label: "Durnin-Womersley (4 pliegues)", needs: "Pliegues bicipital, tricipital, subescapular y suprailíaco" },
  { value: "JACKSON_POLLOCK_3", label: "Jackson-Pollock (3 pliegues)", needs: "Hombres: pectoral, abdominal y muslo · Mujeres: tricipital, suprailíaco y muslo" },
  { value: "NAVY", label: "Marina de EE. UU. (circunferencias)", needs: "Talla, cuello y cintura (y cadera en mujeres)" },
  { value: "DEURENBERG", label: "Deurenberg (por IMC)", needs: "Peso, talla, edad y sexo" },
];

// Pliegues cutáneos en milímetros.
export interface Skinfolds {
  biceps?: number | null;
  triceps?: number | null;
  subscapular?: number | null;
  suprailiac?: number | null;
  abdominal?: number | null;
  chest?: number | null;
  thigh?: number | null;
  calf?: number | null;
}

export const SKINFOLDS: { key: keyof Skinfolds; label: string }[] = [
  { key: "triceps", label: "Tricipital" },
  { key: "biceps", label: "Bicipital" },
  { key: "subscapular", label: "Subescapular" },
  { key: "suprailiac", label: "Suprailíaco" },
  { key: "abdominal", label: "Abdominal" },
  { key: "chest", label: "Pectoral" },
  { key: "thigh", label: "Muslo" },
  { key: "calf", label: "Pantorrilla" },
];

export interface BodyFatInput {
  sex: Sex;
  ageYears: number;
  weightKg?: number | null;
  heightCm?: number | null;
  waistCm?: number | null;
  hipCm?: number | null;
  neckCm?: number | null;
  skinfolds?: Skinfolds;
}

export interface BodyFatResult {
  method: BodyFatMethod;
  label: string;
  // null cuando faltan datos; en ese caso missing dice qué falta.
  bodyFatPct: number | null;
  density: number | null;
  missing: string | null;
}

// Coeficientes de Durnin-Womersley (1974) por sexo y edad: densidad = c - m · log10(suma de 4 pliegues).
const DURNIN: Record<Sex, [number, number, number][]> = {
  MALE: [
    [20, 1.162, 0.063],
    [30, 1.1631, 0.0632],
    [40, 1.1422, 0.0544],
    [50, 1.162, 0.07],
    [Infinity, 1.1715, 0.0779],
  ],
  FEMALE: [
    [20, 1.1549, 0.0678],
    [30, 1.1599, 0.0717],
    [40, 1.1423, 0.0632],
    [50, 1.1333, 0.0612],
    [Infinity, 1.1339, 0.0645],
  ],
};

// Ecuación de Siri: % grasa a partir de la densidad corporal.
function siri(density: number): number {
  return 495 / density - 450;
}

function filled(values: (number | null | undefined)[]): values is number[] {
  return values.every((v) => typeof v === "number" && v > 0);
}

export function bodyFat(method: BodyFatMethod, input: BodyFatInput): BodyFatResult {
  const label = BODY_FAT_METHODS.find((m) => m.value === method)!.label;
  const s = input.skinfolds ?? {};
  const result = (density: number | null, pct: number | null, missing: string | null = null): BodyFatResult => ({
    method,
    label,
    density: density !== null ? round(density, 4) : null,
    bodyFatPct: pct !== null && pct > 0 && pct < 70 ? round(pct) : null,
    missing: missing ?? (pct === null ? null : pct <= 0 || pct >= 70 ? "Revisa las medidas: el resultado no es válido" : null),
  });

  switch (method) {
    case "DURNIN_WOMERSLEY": {
      const folds = [s.biceps, s.triceps, s.subscapular, s.suprailiac];
      if (!filled(folds)) return result(null, null, "Faltan pliegues bicipital, tricipital, subescapular o suprailíaco");
      const sum = folds.reduce((a, b) => a + b, 0);
      const [, c, m] = DURNIN[input.sex].find(([limit]) => input.ageYears < limit)!;
      const density = c - m * Math.log10(sum);
      return result(density, siri(density));
    }
    case "JACKSON_POLLOCK_3": {
      const folds = input.sex === "MALE" ? [s.chest, s.abdominal, s.thigh] : [s.triceps, s.suprailiac, s.thigh];
      if (!filled(folds)) {
        return result(null, null, input.sex === "MALE" ? "Faltan pliegues pectoral, abdominal o muslo" : "Faltan pliegues tricipital, suprailíaco o muslo");
      }
      const sum = folds.reduce((a, b) => a + b, 0);
      const age = input.ageYears;
      const density =
        input.sex === "MALE"
          ? 1.10938 - 0.0008267 * sum + 0.0000016 * sum * sum - 0.0002574 * age
          : 1.0994921 - 0.0009929 * sum + 0.0000023 * sum * sum - 0.0001392 * age;
      return result(density, siri(density));
    }
    case "NAVY": {
      const { heightCm: h, waistCm: waist, neckCm: neck, hipCm: hip } = input;
      if (input.sex === "MALE") {
        if (!filled([h, waist, neck]) || waist! <= neck!) return result(null, null, "Faltan talla, cuello o cintura");
        return result(null, 495 / (1.0324 - 0.19077 * Math.log10(waist! - neck!) + 0.15456 * Math.log10(h!)) - 450);
      }
      if (!filled([h, waist, neck, hip]) || waist! + hip! <= neck!) return result(null, null, "Faltan talla, cuello, cintura o cadera");
      return result(null, 495 / (1.29579 - 0.35004 * Math.log10(waist! + hip! - neck!) + 0.221 * Math.log10(h!)) - 450);
    }
    case "DEURENBERG": {
      const { weightKg: w, heightCm: h } = input;
      if (!filled([w, h])) return result(null, null, "Faltan peso o talla");
      const bmi = w! / (h! / 100) ** 2;
      return result(null, 1.2 * bmi + 0.23 * input.ageYears - 10.8 * (input.sex === "MALE" ? 1 : 0) - 5.4);
    }
  }
}

// Clasificación del % de grasa (American Council on Exercise).
export function bodyFatCategory(sex: Sex, pct: number): { label: string; alert: boolean } {
  const limits = sex === "MALE" ? [6, 14, 18, 25] : [14, 21, 25, 32];
  if (pct < limits[0]) return { label: "Grasa esencial (muy baja)", alert: true };
  if (pct < limits[1]) return { label: "Atlético", alert: false };
  if (pct < limits[2]) return { label: "En forma", alert: false };
  if (pct < limits[3]) return { label: "Aceptable", alert: false };
  return { label: "Obesidad", alert: true };
}

// Complexión por la relación talla / circunferencia de muñeca.
export function frameSize(sex: Sex, heightCm: number, wristCm: number): { ratio: number; label: string } {
  const ratio = heightCm / wristCm;
  const [small, large] = sex === "MALE" ? [10.4, 9.6] : [11, 10.1];
  const label = ratio > small ? "Pequeña" : ratio < large ? "Grande" : "Mediana";
  return { ratio: round(ratio), label };
}

// Indicadores del brazo con la circunferencia (cm) y el pliegue tricipital (mm).
export function armIndices(sex: Sex, armCm: number, tricepsMm: number) {
  const tsfCm = tricepsMm / 10;
  const muscleCircumference = armCm - Math.PI * tsfCm;
  const totalArea = (armCm * armCm) / (4 * Math.PI);
  const muscleArea = (muscleCircumference * muscleCircumference) / (4 * Math.PI);
  // Área muscular corregida por hueso (Heymsfield).
  const correctedMuscleArea = muscleArea - (sex === "MALE" ? 10 : 6.5);
  return {
    muscleCircumferenceCm: round(muscleCircumference),
    muscleAreaCm2: round(Math.max(correctedMuscleArea, 0)),
    fatAreaCm2: round(totalArea - muscleArea),
  };
}

// Porcentaje de cambio respecto al peso habitual; más del 5 % en un mes o 10 % en seis meses es pérdida significativa.
export function weightLossPct(currentKg: number, usualKg: number): number {
  return round(((usualKg - currentKg) / usualKg) * 100);
}

// ─── Índice y carga glucémica ────────────────

export type GlycemicLevel = "LOW" | "MEDIUM" | "HIGH";

// Clasificación del índice glucémico: bajo ≤ 55, medio 56–69, alto ≥ 70.
export function glycemicLevel(gi: number): GlycemicLevel {
  return gi <= 55 ? "LOW" : gi < 70 ? "MEDIUM" : "HIGH";
}

// Carga glucémica de una porción = IG × carbohidratos (g) ÷ 100. Baja ≤ 10, media 11–19, alta ≥ 20.
export function glycemicLoad(gi: number, choG: number): { value: number; level: GlycemicLevel } {
  const value = round((gi * choG) / 100);
  return { value, level: value <= 10 ? "LOW" : value < 20 ? "MEDIUM" : "HIGH" };
}
