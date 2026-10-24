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
}

export interface Indicator {
  key: string;
  label: string;
  value: number;
  unit: string;
  // Interpretación y si representa un riesgo.
  status?: string;
  alert?: boolean;
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
    out.push({ key: "idealWeight", label: "Peso ideal (IMC 22)", value: round(ideal), unit: "kg" });
    out.push({
      key: "healthyRange",
      label: "Rango de peso saludable",
      value: round(18.5 * m * m),
      unit: `– ${round(24.9 * m * m)} kg`,
    });
    if (bmi >= 30) {
      // Peso ajustado para obesidad: ideal + 25 % del exceso.
      out.push({ key: "adjustedWeight", label: "Peso ajustado", value: round(ideal + 0.25 * (w - ideal)), unit: "kg" });
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
  const total = resting * factor;
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
