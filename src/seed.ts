// Carga los catálogos base: planes comerciales, sistemas de intercambio y alimentos.
// Solo crea lo que falta: si el administrador ya editó un valor, no se sobrescribe.
// Se ejecuta en cada arranque (npm start).

import { FoodSource, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PLANS = [
  {
    code: "BASICO",
    name: "Básico",
    description: "Para empezar tu consulta",
    priceCents: 1900,
    maxPatients: 40,
    sortOrder: 1,
    features: ["Hasta 40 pacientes activos", "Cálculos y planes alimentarios", "Informes en PDF"],
  },
  {
    code: "PROFESIONAL",
    name: "Profesional",
    description: "Para consultas en crecimiento",
    priceCents: 3900,
    maxPatients: 200,
    sortOrder: 2,
    features: ["Hasta 200 pacientes activos", "Recetas y alimentos propios", "Informes de progreso"],
  },
  {
    code: "CLINICA",
    name: "Clínica",
    description: "Pacientes ilimitados",
    priceCents: 7900,
    maxPatients: null,
    sortOrder: 3,
    features: ["Pacientes ilimitados", "Soporte prioritario"],
  },
];

// Equivalencias por porción (kcal, carbohidratos, proteínas, grasas).
// Referencia: listas de intercambio de la ADA (Choose Your Foods). Leguminosas: valor promedio
// de ½ taza cocida. El administrador puede ajustarlas desde el panel.
type G = [key: string, family: string, name: string, kcal: number, cho: number, pro: number, fat: number, hint: string, color: string];

const TRADITIONAL_GROUPS: G[] = [
  ["CEREALS", "CEREALS", "Cereales y almidones", 80, 15, 3, 1, "1 porción = 15 g de carbohidratos", "#d9a441"],
  ["LEGUMES", "LEGUMES", "Leguminosas", 120, 20, 8, 1, "1 porción = ½ taza cocida", "#a0694a"],
  ["VEGETABLES", "VEGETABLES", "Vegetales", 25, 5, 2, 0, "1 porción = ½ taza cocida o 1 taza cruda", "#4f8a5b"],
  ["FRUITS", "FRUITS", "Frutas", 60, 15, 0, 0, "1 porción = 15 g de carbohidratos", "#e07a5f"],
  ["MILK_SKIM", "MILK", "Lácteos descremados", 100, 12, 8, 2, "1 porción = 1 taza", "#6fa3db"],
  ["MILK_LOW", "MILK", "Lácteos semidescremados", 120, 12, 8, 5, "1 porción = 1 taza", "#5b8fc7"],
  ["MILK_WHOLE", "MILK", "Lácteos enteros", 160, 12, 8, 8, "1 porción = 1 taza", "#477bb3"],
  ["MEAT_LEAN", "MEAT", "Carnes magras", 45, 0, 7, 2, "1 porción = 1 onza (30 g)", "#c8553d"],
  ["MEAT_MEDIUM", "MEAT", "Carnes semigrasas", 75, 0, 7, 5, "1 porción = 1 onza (30 g)", "#b04a35"],
  ["MEAT_HIGH", "MEAT", "Carnes grasas", 100, 0, 7, 8, "1 porción = 1 onza (30 g)", "#97402d"],
  ["FAT", "FAT", "Grasas", 45, 0, 0, 5, "1 porción = 5 g de grasa", "#e9c46a"],
  ["SUGAR", "SUGAR", "Azúcares", 60, 15, 0, 0, "1 porción = 15 g de carbohidratos", "#9f8be0"],
];

// Mismos valores de equivalencia, con los nombres de grupo usados en Panamá.
const PANAMA_NAMES: Record<string, string> = {
  CEREALS: "Cereales, tubérculos y plátano",
  LEGUMES: "Menestras",
  VEGETABLES: "Vegetales",
  FRUITS: "Frutas",
  MILK_SKIM: "Lácteos descremados",
  MILK_LOW: "Lácteos semidescremados",
  MILK_WHOLE: "Lácteos enteros",
  MEAT_LEAN: "Carnes y sustitutos magros",
  MEAT_MEDIUM: "Carnes y sustitutos semigrasos",
  MEAT_HIGH: "Carnes y sustitutos grasos",
  FAT: "Grasas",
  SUGAR: "Azúcares",
};

// [nombre, categoría, porción equivalente a 1 intercambio, gramos]
type F = [name: string, category: string, portion: string, grams: number | null];

const PANAMA_FOODS: Record<string, F[]> = {
  CEREALS: [
    ["Arroz blanco cocido", "Cereales", "1/3 taza", 50],
    ["Arroz integral cocido", "Cereales", "1/3 taza", 50],
    ["Yuca cocida", "Tubérculos", "1/3 taza", 50],
    ["Ñame cocido", "Tubérculos", "1/3 taza", 55],
    ["Otoe cocido", "Tubérculos", "1/3 taza", 55],
    ["Papa cocida", "Tubérculos", "½ taza", 75],
    ["Camote cocido", "Tubérculos", "1/3 taza", 55],
    ["Plátano verde cocido", "Plátanos", "1/3 unidad pequeña", 50],
    ["Plátano maduro cocido", "Plátanos", "¼ unidad mediana", 45],
    ["Guineo verde cocido", "Plátanos", "½ unidad", 60],
    ["Tortilla de maíz asada", "Maíz", "½ tortilla mediana", 35],
    ["Bollo de maíz", "Maíz", "¼ unidad", 50],
    ["Maíz en grano cocido", "Maíz", "½ taza", 80],
    ["Mazorca de maíz", "Maíz", "½ mazorca mediana", 75],
    ["Pan de molde blanco", "Panes", "1 rebanada", 28],
    ["Pan de molde integral", "Panes", "1 rebanada", 28],
    ["Pan de flauta", "Panes", "¼ unidad", 30],
    ["Galletas de soda", "Galletas", "5 unidades", 20],
    ["Avena en hojuelas", "Cereales", "3 cucharadas (cruda)", 20],
    ["Avena cocida", "Cereales", "½ taza", 120],
    ["Pasta cocida (macarrones, espaguetis)", "Cereales", "1/3 taza", 50],
    ["Hojuelas de maíz (corn flakes)", "Cereales", "¾ taza", 20],
    ["Crema de maíz (Maicena) cocida", "Cereales", "½ taza", 120],
  ],
  LEGUMES: [
    ["Frijoles rojos cocidos", "Menestras", "½ taza", 90],
    ["Frijoles negros cocidos", "Menestras", "½ taza", 90],
    ["Porotos cocidos", "Menestras", "½ taza", 90],
    ["Lentejas cocidas", "Menestras", "½ taza", 100],
    ["Guandú cocido", "Menestras", "½ taza", 85],
    ["Garbanzos cocidos", "Menestras", "½ taza", 80],
    ["Arvejas secas cocidas", "Menestras", "½ taza", 100],
  ],
  VEGETABLES: [
    ["Lechuga", "Hojas", "1 taza cruda", 55],
    ["Repollo", "Hojas", "1 taza crudo / ½ taza cocido", 70],
    ["Espinaca", "Hojas", "1 taza cruda / ½ taza cocida", 30],
    ["Tomate", "Vegetales", "1 unidad mediana", 120],
    ["Pepino", "Vegetales", "1 taza en rodajas", 120],
    ["Zanahoria", "Vegetales", "½ taza cocida / 1 unidad pequeña cruda", 75],
    ["Habichuelas", "Vegetales", "½ taza cocidas", 65],
    ["Zapallo", "Vegetales", "½ taza cocido", 80],
    ["Chayote", "Vegetales", "½ taza cocido", 80],
    ["Brócoli", "Vegetales", "½ taza cocido", 75],
    ["Coliflor", "Vegetales", "½ taza cocida", 60],
    ["Berenjena", "Vegetales", "½ taza cocida", 50],
    ["Pimentón (ají dulce)", "Vegetales", "1 taza crudo", 90],
    ["Cebolla", "Vegetales", "½ taza cocida", 55],
    ["Remolacha", "Vegetales", "½ taza cocida", 60],
    ["Apio", "Vegetales", "1 taza crudo", 100],
    ["Ocra (molondrón)", "Vegetales", "½ taza cocida", 80],
    ["Hongos", "Vegetales", "½ taza cocidos", 75],
  ],
  FRUITS: [
    ["Guineo", "Frutas", "½ unidad mediana", 60],
    ["Papaya", "Frutas", "1 taza picada", 145],
    ["Piña", "Frutas", "¾ taza picada", 120],
    ["Mango", "Frutas", "½ taza picado", 80],
    ["Sandía", "Frutas", "1¼ taza picada", 190],
    ["Melón", "Frutas", "1 taza picado", 160],
    ["Naranja", "Frutas", "1 unidad mediana", 130],
    ["Mandarina", "Frutas", "2 unidades pequeñas", 150],
    ["Manzana", "Frutas", "1 unidad pequeña", 100],
    ["Pera", "Frutas", "½ unidad grande", 90],
    ["Uvas", "Frutas", "17 unidades", 85],
    ["Fresas", "Frutas", "1¼ taza", 180],
    ["Guayaba", "Frutas", "1 unidad mediana", 100],
    ["Guanábana (pulpa)", "Frutas", "½ taza", 90],
    ["Maracuyá (pulpa)", "Frutas", "1/3 taza", 60],
    ["Marañón (fruta)", "Frutas", "1 unidad", 100],
    ["Pitahaya", "Frutas", "½ taza", 100],
    ["Nance", "Frutas", "½ taza", 60],
    ["Jugo de naranja natural", "Jugos", "½ taza", 120],
  ],
  MILK_SKIM: [
    ["Leche descremada", "Leches", "1 taza (240 ml)", 240],
    ["Leche en polvo descremada", "Leches", "3 cucharadas", 25],
    ["Yogur natural descremado", "Yogures", "¾ taza", 170],
  ],
  MILK_LOW: [
    ["Leche semidescremada (2 %)", "Leches", "1 taza (240 ml)", 240],
    ["Yogur natural semidescremado", "Yogures", "¾ taza", 170],
  ],
  MILK_WHOLE: [
    ["Leche entera", "Leches", "1 taza (240 ml)", 240],
    ["Leche en polvo entera", "Leches", "4 cucharadas", 30],
    ["Leche evaporada", "Leches", "½ taza", 125],
    ["Yogur natural entero", "Yogures", "¾ taza", 170],
  ],
  MEAT_LEAN: [
    ["Pechuga de pollo sin piel", "Aves", "30 g cocida", 30],
    ["Pavo sin piel", "Aves", "30 g cocido", 30],
    ["Corvina", "Pescados", "30 g cocida", 30],
    ["Pargo", "Pescados", "30 g cocido", 30],
    ["Atún en agua", "Pescados", "¼ taza escurrido", 30],
    ["Camarones", "Mariscos", "30 g cocidos (5–6 medianos)", 30],
    ["Carne de res magra (posta, filete)", "Res", "30 g cocida", 30],
    ["Lomo de cerdo", "Cerdo", "30 g cocido", 30],
    ["Jamón de pavo", "Embutidos", "1 rebanada (30 g)", 30],
    ["Clara de huevo", "Huevos", "2 unidades", 66],
    ["Queso cottage", "Quesos", "¼ taza", 55],
  ],
  MEAT_MEDIUM: [
    ["Huevo entero", "Huevos", "1 unidad", 50],
    ["Muslo de pollo sin piel", "Aves", "30 g cocido", 30],
    ["Carne molida de res", "Res", "30 g cocida", 30],
    ["Queso blanco fresco", "Quesos", "30 g", 30],
    ["Queso mozzarella", "Quesos", "30 g", 30],
    ["Sardinas en aceite escurridas", "Pescados", "2 unidades", 30],
    ["Salmón", "Pescados", "30 g cocido", 30],
    ["Tofu", "Sustitutos", "½ taza", 120],
  ],
  MEAT_HIGH: [
    ["Queso amarillo (cheddar)", "Quesos", "30 g", 30],
    ["Salchicha", "Embutidos", "1 unidad", 45],
    ["Chorizo", "Embutidos", "30 g", 30],
    ["Mortadela", "Embutidos", "1 rebanada (30 g)", 30],
    ["Costilla de cerdo", "Cerdo", "30 g cocida", 30],
  ],
  FAT: [
    ["Aceite vegetal", "Aceites", "1 cucharadita", 5],
    ["Aceite de oliva", "Aceites", "1 cucharadita", 5],
    ["Mantequilla", "Grasas", "1 cucharadita", 5],
    ["Margarina", "Grasas", "1 cucharadita", 5],
    ["Mayonesa", "Aderezos", "1 cucharadita", 5],
    ["Aguacate", "Frutos grasos", "2 cucharadas (30 g)", 30],
    ["Maní", "Semillas", "10 unidades", 8],
    ["Almendras", "Semillas", "6 unidades", 8],
    ["Semillas de marañón", "Semillas", "6 unidades", 8],
    ["Coco rallado", "Frutos grasos", "2 cucharadas", 10],
    ["Queso crema", "Lácteos grasos", "1 cucharada", 15],
    ["Crema de leche", "Lácteos grasos", "1 cucharada", 15],
  ],
  SUGAR: [
    ["Azúcar", "Azúcares", "1 cucharada", 15],
    ["Miel de abeja", "Azúcares", "1 cucharada", 20],
    ["Raspadura (panela)", "Azúcares", "15 g", 15],
    ["Mermelada", "Azúcares", "1 cucharada", 20],
    ["Gelatina con azúcar", "Postres", "½ taza", 120],
    ["Refresco o soda regular", "Bebidas", "½ taza", 120],
  ],
};

// Listas tradicionales: porciones de referencia de uso general.
const TRADITIONAL_FOODS: Record<string, F[]> = {
  CEREALS: [
    ["Arroz cocido", "Cereales", "1/3 taza", 50],
    ["Pan blanco", "Panes", "1 rebanada", 28],
    ["Pan integral", "Panes", "1 rebanada", 28],
    ["Tortilla de maíz", "Maíz", "1 unidad (15 cm)", 30],
    ["Tortilla de harina", "Trigo", "1 unidad pequeña (15 cm)", 30],
    ["Pasta cocida", "Cereales", "1/3 taza", 50],
    ["Avena cocida", "Cereales", "½ taza", 120],
    ["Cereal de caja sin azúcar", "Cereales", "¾ taza", 20],
    ["Papa cocida", "Tubérculos", "½ taza", 75],
    ["Maíz cocido", "Maíz", "½ taza", 80],
    ["Galletas saladas", "Galletas", "6 unidades", 20],
    ["Palomitas de maíz naturales", "Cereales", "3 tazas", 22],
  ],
  LEGUMES: [
    ["Frijoles cocidos", "Leguminosas", "½ taza", 90],
    ["Lentejas cocidas", "Leguminosas", "½ taza", 100],
    ["Garbanzos cocidos", "Leguminosas", "½ taza", 80],
  ],
  VEGETABLES: [
    ["Vegetales cocidos (mezcla)", "Vegetales", "½ taza", 80],
    ["Vegetales crudos (mezcla)", "Vegetales", "1 taza", 80],
    ["Ensalada verde", "Hojas", "1 taza", 60],
    ["Jugo de tomate", "Jugos", "½ taza", 120],
  ],
  FRUITS: [
    ["Manzana", "Frutas", "1 unidad pequeña", 100],
    ["Plátano (banano)", "Frutas", "½ unidad mediana", 60],
    ["Naranja", "Frutas", "1 unidad mediana", 130],
    ["Uvas", "Frutas", "17 unidades", 85],
    ["Fruta picada (mezcla)", "Frutas", "1 taza", 150],
    ["Pasas", "Frutas secas", "2 cucharadas", 20],
    ["Jugo de fruta natural", "Jugos", "½ taza", 120],
  ],
  MILK_SKIM: [
    ["Leche descremada", "Leches", "1 taza (240 ml)", 240],
    ["Yogur descremado sin azúcar", "Yogures", "⅔ taza", 170],
  ],
  MILK_LOW: [["Leche semidescremada", "Leches", "1 taza (240 ml)", 240]],
  MILK_WHOLE: [["Leche entera", "Leches", "1 taza (240 ml)", 240]],
  MEAT_LEAN: [
    ["Pollo sin piel", "Aves", "30 g cocido", 30],
    ["Pescado blanco", "Pescados", "30 g cocido", 30],
    ["Res magra", "Res", "30 g cocida", 30],
    ["Claras de huevo", "Huevos", "2 unidades", 66],
  ],
  MEAT_MEDIUM: [
    ["Huevo", "Huevos", "1 unidad", 50],
    ["Queso fresco", "Quesos", "30 g", 30],
    ["Carne molida", "Res", "30 g cocida", 30],
  ],
  MEAT_HIGH: [
    ["Queso amarillo", "Quesos", "30 g", 30],
    ["Embutidos (salchicha, salami)", "Embutidos", "30 g", 30],
  ],
  FAT: [
    ["Aceite", "Aceites", "1 cucharadita", 5],
    ["Mantequilla", "Grasas", "1 cucharadita", 5],
    ["Aguacate", "Frutos grasos", "2 cucharadas", 30],
    ["Nueces", "Semillas", "4 mitades", 8],
    ["Mayonesa", "Aderezos", "1 cucharadita", 5],
  ],
  SUGAR: [
    ["Azúcar", "Azúcares", "1 cucharada", 15],
    ["Miel", "Azúcares", "1 cucharada", 20],
    ["Mermelada", "Azúcares", "1 cucharada", 20],
  ],
};

function code(prefix: string, name: string) {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return `${prefix}_${slug}`.slice(0, 80);
}

async function seedSystem(systemCode: string, name: string, description: string, source: string, groupName: (g: G) => string) {
  const system = await prisma.exchangeSystem.upsert({
    where: { code: systemCode },
    create: { code: systemCode, name, description, source },
    update: {},
  });
  const ids: Record<string, { id: string; kcal: number; cho: number; pro: number; fat: number }> = {};
  for (const [i, g] of TRADITIONAL_GROUPS.entries()) {
    const [key, family, , kcal, cho, pro, fat, hint, color] = g;
    const group = await prisma.exchangeGroup.upsert({
      where: { systemId_key: { systemId: system.id, key } },
      create: {
        systemId: system.id,
        key,
        family,
        name: groupName(g),
        kcal,
        choG: cho,
        proG: pro,
        fatG: fat,
        portionHint: hint,
        color,
        sortOrder: i,
      },
      update: {},
    });
    ids[key] = { id: group.id, kcal: Number(group.kcal), cho: Number(group.choG), pro: Number(group.proG), fat: Number(group.fatG) };
  }
  return ids;
}

async function seedFoods(prefix: string, source: FoodSource, foods: Record<string, F[]>, groups: Awaited<ReturnType<typeof seedSystem>>) {
  let created = 0;
  for (const [key, list] of Object.entries(foods)) {
    const g = groups[key];
    for (const [name, category, portion, grams] of list) {
      const foodCode = code(prefix, name);
      const exists = await prisma.food.findUnique({ where: { code: foodCode }, select: { id: true } });
      if (exists) continue;
      // Cada porción listada equivale a un intercambio: toma los valores del grupo.
      await prisma.food.create({
        data: {
          code: foodCode,
          source,
          groupId: g.id,
          name,
          category,
          portionText: portion,
          portionGrams: grams,
          kcal: g.kcal,
          choG: g.cho,
          proG: g.pro,
          fatG: g.fat,
        },
      });
      created++;
    }
  }
  return created;
}

async function main() {
  for (const plan of PLANS) {
    await prisma.subscriptionPlan.upsert({ where: { code: plan.code }, create: plan, update: {} });
  }

  const traditional = await seedSystem(
    "TRADICIONAL",
    "Listas tradicionales",
    "Sistema de intercambios clásico por grupos de alimentos.",
    "American Diabetes Association · Choose Your Foods",
    (g) => g[2],
  );
  const panama = await seedSystem(
    "PANAMA",
    "Base de alimentos de Panamá",
    "Alimentos y porciones de consumo habitual en Panamá, con las mismas equivalencias por grupo.",
    "Porciones de referencia; verificar con la Tabla de Composición de Alimentos de Centroamérica (INCAP)",
    (g) => PANAMA_NAMES[g[0]] ?? g[2],
  );

  const createdTraditional = await seedFoods("TRAD", FoodSource.TRADITIONAL, TRADITIONAL_FOODS, traditional);
  const createdPanama = await seedFoods("PA", FoodSource.PANAMA, PANAMA_FOODS, panama);
  console.log(`Catálogos listos (${createdTraditional + createdPanama} alimentos nuevos)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
