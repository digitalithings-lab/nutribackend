import { Prisma } from "@prisma/client";
import { num } from "../common/dates";
import { glycemicLevel, GlycemicLevel, round } from "../nutrition/calc";

export interface ShoppingExtra {
  name: string;
  quantity?: string;
  note?: string;
}

export interface ShoppingItem {
  foodId: string | null;
  name: string;
  brand: string | null;
  imageId: string | null;
  // Porciones totales del periodo y su equivalencia.
  servings: number;
  portionText: string | null;
  grams: number | null;
  glycemicIndex: number | null;
  glycemicLevel: GlycemicLevel | null;
}

export interface ShoppingSection {
  key: string;
  name: string;
  color: string;
  items: ShoppingItem[];
}

type PlanForShopping = Prisma.MealPlanGetPayload<{
  include: {
    meals: {
      include: {
        items: {
          include: {
            food: { include: { group: true } };
            recipe: { include: { ingredients: { include: { food: { include: { group: true } } } } } };
          };
        };
      };
    };
  };
}>;

type Food = NonNullable<PlanForShopping["meals"][number]["items"][number]["food"]>;

// Lista de supermercado para N días: suma los alimentos principales del menú (no las sustituciones)
// y los ingredientes de las recetas, agrupados por grupo de alimentos.
export function buildShoppingList(plan: PlanForShopping, days: number) {
  const byFood = new Map<string, { food: Food; servings: number }>();
  const custom = new Map<string, number>();

  const add = (food: Food, servings: number) => {
    const current = byFood.get(food.id);
    byFood.set(food.id, { food, servings: (current?.servings ?? 0) + servings });
  };

  for (const meal of plan.meals) {
    for (const item of meal.items) {
      if (item.substituteOfId) continue;
      const servings = num(item.servings)! * days;
      if (item.food) add(item.food, servings);
      else if (item.recipe) {
        // Raciones de la receta → porciones de cada ingrediente.
        for (const ing of item.recipe.ingredients) add(ing.food, (num(ing.servings)! / item.recipe.servings) * servings);
      } else if (item.customName) custom.set(item.customName, (custom.get(item.customName) ?? 0) + servings);
    }
  }

  const sections = new Map<string, ShoppingSection>();
  for (const { food, servings } of byFood.values()) {
    const key = food.group?.family ?? "OTHER";
    const section = sections.get(key) ?? {
      key,
      name: food.group ? sectionName(food.group.family, food.group.name) : "Otros",
      color: food.group?.color ?? "#97a8a2",
      items: [],
    };
    const grams = num(food.portionGrams);
    section.items.push({
      foodId: food.id,
      name: food.name,
      brand: food.brand,
      imageId: food.imageId,
      servings: round(servings),
      portionText: food.portionText,
      // Se redondea a 10 g para que sea práctico al comprar.
      grams: grams ? Math.max(10, Math.round((grams * servings) / 10) * 10) : null,
      glycemicIndex: food.glycemicIndex,
      glycemicLevel: food.glycemicIndex !== null ? glycemicLevel(food.glycemicIndex) : null,
    });
    sections.set(key, section);
  }
  for (const [name, servings] of custom) {
    const section = sections.get("OTHER") ?? { key: "OTHER", name: "Otros", color: "#97a8a2", items: [] };
    section.items.push({
      foodId: null,
      name,
      brand: null,
      imageId: null,
      servings: round(servings),
      portionText: null,
      grams: null,
      glycemicIndex: null,
      glycemicLevel: null,
    });
    sections.set("OTHER", section);
  }

  const order = ["VEGETABLES", "FRUITS", "CEREALS", "LEGUMES", "MEAT", "MILK", "FAT", "SUGAR", "OTHER"];
  const list = [...sections.values()]
    .map((s) => ({ ...s, items: s.items.sort((a, b) => a.name.localeCompare(b.name, "es")) }))
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

  return {
    days,
    sections: list,
    extras: (Array.isArray(plan.shoppingExtras) ? plan.shoppingExtras : []) as unknown as ShoppingExtra[],
  };
}

// Nombre de sección de compra según la familia del grupo de intercambio.
function sectionName(family: string, groupName: string) {
  const names: Record<string, string> = {
    VEGETABLES: "Verduras y vegetales",
    FRUITS: "Frutas",
    CEREALS: "Cereales, panes y tubérculos",
    LEGUMES: "Menestras",
    MEAT: "Carnes, pescados, huevos y quesos",
    MILK: "Lácteos",
    FAT: "Aceites, grasas y semillas",
    SUGAR: "Azúcares",
  };
  return names[family] ?? groupName;
}

// Cantidad legible: "≈ 450 g · 9 × 1/3 taza".
export function quantityText(item: ShoppingItem): string {
  const portions = item.portionText ? `${item.servings} × ${item.portionText}` : `${item.servings} porciones`;
  return item.grams ? `≈ ${item.grams} g · ${portions}` : portions;
}
