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
  Query,
} from "@nestjs/common";
import { FoodSource, Prisma } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { AuthUser, CurrentUser } from "../common/auth.decorators";
import { EmptyToUndefined, Trim } from "../common/dto";
import { num } from "../common/dates";
import { Roles } from "../common/roles";
import { round } from "../nutrition/calc";
import { PrismaService } from "../prisma/prisma.service";

const grams = (max: number) => applyDecorators(Type(() => Number), IsNumber(), Min(0), Max(max));

export class FoodDto {
  @Trim() @IsString() @Length(2, 100) name: string;
  @Trim() @IsString() @Length(2, 60) category: string;
  @IsOptional() @IsUUID() groupId?: string | null;
  @Trim() @IsString() @Length(1, 80) portionText: string;
  @IsOptional() @grams(2000) portionGrams?: number | null;
  @grams(2000) kcal: number;
  @grams(300) choG: number;
  @grams(300) proG: number;
  @grams(300) fatG: number;
  @IsOptional() @grams(100) fiberG?: number | null;
  @IsOptional() @EmptyToUndefined() @IsString() @MaxLength(500) notes?: string;
}

export class RecipeIngredientDto {
  @IsUUID() foodId: string;
  @Type(() => Number) @IsNumber() @Min(0.25) @Max(50) servings: number;
  @IsOptional() @IsString() @MaxLength(100) note?: string;
}

export class RecipeDto {
  @Trim() @IsString() @Length(2, 100) name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsInt() @Min(1) @Max(50) servings: number;
  @IsOptional() @IsString() @MaxLength(6000) instructions?: string;
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientDto)
  ingredients: RecipeIngredientDto[];
}

const FOOD_INCLUDE = { group: { include: { system: { select: { code: true } } } } } satisfies Prisma.FoodInclude;

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  systems() {
    return this.prisma.exchangeSystem.findMany({
      orderBy: { code: "desc" },
      include: { groups: { orderBy: { sortOrder: "asc" } } },
    });
  }

  // Alimentos visibles para una nutricionista: el catálogo general más los suyos.
  visibleFoods(nutritionistId: string): Prisma.FoodWhereInput {
    return { active: true, OR: [{ nutritionistId: null }, { nutritionistId }] };
  }

  async foods(
    nutritionistId: string,
    filters: { search?: string; source?: string; groupKey?: string; family?: string; limit?: number },
  ) {
    const sources = (filters.source ?? "")
      .split(",")
      .filter((s): s is FoodSource => Object.values(FoodSource).includes(s as FoodSource));
    const words = (filters.search ?? "").trim().split(/\s+/).filter(Boolean);
    return this.prisma.food.findMany({
      where: {
        AND: [
          this.visibleFoods(nutritionistId),
          sources.length ? { source: { in: sources } } : {},
          filters.groupKey ? { group: { key: filters.groupKey } } : {},
          filters.family ? { group: { family: filters.family } } : {},
          ...words.map((w) => ({
            OR: [
              { name: { contains: w, mode: "insensitive" as const } },
              { category: { contains: w, mode: "insensitive" as const } },
            ],
          })),
        ],
      },
      orderBy: [{ group: { sortOrder: "asc" } }, { name: "asc" }],
      take: Math.min(filters.limit ?? 200, 500),
      include: FOOD_INCLUDE,
    });
  }

  // Alimentos equivalentes (mismo grupo de intercambio) para proponer sustituciones.
  async equivalents(nutritionistId: string, foodId: string) {
    const food = await this.prisma.food.findFirst({
      where: { id: foodId, ...this.visibleFoods(nutritionistId) },
      include: { group: true },
    });
    if (!food) throw new NotFoundException("Alimento no encontrado");
    if (!food.group) return [];
    return this.prisma.food.findMany({
      where: { AND: [this.visibleFoods(nutritionistId), { id: { not: foodId }, group: { key: food.group.key } }] },
      orderBy: { name: "asc" },
      include: FOOD_INCLUDE,
    });
  }

  async createFood(nutritionistId: string, dto: FoodDto) {
    if (dto.groupId) await this.prisma.exchangeGroup.findUniqueOrThrow({ where: { id: dto.groupId } });
    return this.prisma.food.create({
      data: { ...dto, nutritionistId, source: FoodSource.CUSTOM },
      include: FOOD_INCLUDE,
    });
  }

  async updateFood(nutritionistId: string, id: string, dto: FoodDto) {
    await this.ownFood(nutritionistId, id);
    return this.prisma.food.update({ where: { id }, data: dto, include: FOOD_INCLUDE });
  }

  async removeFood(nutritionistId: string, id: string) {
    await this.ownFood(nutritionistId, id);
    // Si ya se usó en planes o recetas solo se desactiva, para no alterar planes anteriores.
    const used = await this.prisma.food.findUnique({
      where: { id },
      select: { _count: { select: { planItems: true, recipeItems: true } } },
    });
    if (used && used._count.planItems + used._count.recipeItems > 0) {
      await this.prisma.food.update({ where: { id }, data: { active: false } });
    } else {
      await this.prisma.food.delete({ where: { id } });
    }
  }

  private async ownFood(nutritionistId: string, id: string) {
    const food = await this.prisma.food.findFirst({ where: { id, nutritionistId } });
    if (!food) throw new NotFoundException("Solo puedes modificar tus propios alimentos");
    return food;
  }

  // ─── Recetas ───

  async recipes(nutritionistId: string) {
    const recipes = await this.prisma.recipe.findMany({
      where: { OR: [{ nutritionistId }, { nutritionistId: null }] },
      orderBy: { name: "asc" },
      include: { ingredients: { include: { food: { include: { group: true } } } } },
    });
    return recipes.map(withRecipeTotals);
  }

  async recipe(nutritionistId: string, id: string) {
    const recipe = await this.prisma.recipe.findFirst({
      where: { id, OR: [{ nutritionistId }, { nutritionistId: null }] },
      include: { ingredients: { include: { food: { include: { group: true } } } } },
    });
    if (!recipe) throw new NotFoundException("Receta no encontrada");
    return withRecipeTotals(recipe);
  }

  async saveRecipe(nutritionistId: string, dto: RecipeDto, id?: string) {
    if (id) {
      const own = await this.prisma.recipe.findFirst({ where: { id, nutritionistId } });
      if (!own) throw new NotFoundException("Solo puedes modificar tus propias recetas");
    }
    const foodIds = [...new Set(dto.ingredients.map((i) => i.foodId))];
    const visible = await this.prisma.food.count({ where: { id: { in: foodIds }, ...this.visibleFoods(nutritionistId) } });
    if (visible !== foodIds.length) throw new BadRequestException("Algún ingrediente no existe");

    const data = {
      name: dto.name,
      description: dto.description,
      servings: dto.servings,
      instructions: dto.instructions,
    };
    const ingredients = dto.ingredients.map((i) => ({ foodId: i.foodId, servings: i.servings, note: i.note }));

    const saved = await this.prisma.$transaction(async (tx) => {
      if (id) {
        await tx.recipeIngredient.deleteMany({ where: { recipeId: id } });
        return tx.recipe.update({ where: { id }, data: { ...data, ingredients: { create: ingredients } } });
      }
      return tx.recipe.create({ data: { ...data, nutritionistId, ingredients: { create: ingredients } } });
    });
    return this.recipe(nutritionistId, saved.id);
  }

  async removeRecipe(nutritionistId: string, id: string) {
    const own = await this.prisma.recipe.findFirst({ where: { id, nutritionistId } });
    if (!own) throw new NotFoundException("Solo puedes borrar tus propias recetas");
    await this.prisma.recipe.delete({ where: { id } });
  }
}

type RecipeWithFoods = Prisma.RecipeGetPayload<{
  include: { ingredients: { include: { food: { include: { group: true } } } } };
}>;

// Totales de la receta completa, por ración y en intercambios por grupo.
export function withRecipeTotals(recipe: RecipeWithFoods) {
  const total = { kcal: 0, choG: 0, proG: 0, fatG: 0 };
  const exchanges: Record<string, number> = {};
  for (const i of recipe.ingredients) {
    const n = num(i.servings)!;
    total.kcal += num(i.food.kcal)! * n;
    total.choG += num(i.food.choG)! * n;
    total.proG += num(i.food.proG)! * n;
    total.fatG += num(i.food.fatG)! * n;
    if (i.food.group) exchanges[i.food.group.key] = (exchanges[i.food.group.key] ?? 0) + n;
  }
  const per = (v: number) => round(v / recipe.servings);
  return {
    ...recipe,
    totals: { kcal: Math.round(total.kcal), choG: round(total.choG), proG: round(total.proG), fatG: round(total.fatG) },
    perServing: { kcal: Math.round(total.kcal / recipe.servings), choG: per(total.choG), proG: per(total.proG), fatG: per(total.fatG) },
    exchangesPerServing: Object.fromEntries(Object.entries(exchanges).map(([k, v]) => [k, round(v / recipe.servings, 2)])),
  };
}

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("exchange-systems")
  @Roles("NUTRITIONIST", "ADMIN")
  systems() {
    return this.catalog.systems();
  }

  @Get("foods")
  @Roles("NUTRITIONIST", "ADMIN")
  foods(
    @CurrentUser() user: AuthUser,
    @Query("search") search?: string,
    @Query("source") source?: string,
    @Query("groupKey") groupKey?: string,
    @Query("family") family?: string,
    @Query("limit") limit?: string,
  ) {
    return this.catalog.foods(user.id, { search, source, groupKey, family, limit: limit ? Number(limit) || 200 : undefined });
  }

  @Get("foods/:id/equivalents")
  @Roles("NUTRITIONIST", "ADMIN")
  equivalents(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.catalog.equivalents(user.id, id);
  }

  @Post("foods")
  @Roles("NUTRITIONIST")
  createFood(@CurrentUser() user: AuthUser, @Body() dto: FoodDto) {
    return this.catalog.createFood(user.id, dto);
  }

  @Patch("foods/:id")
  @Roles("NUTRITIONIST")
  updateFood(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: FoodDto) {
    return this.catalog.updateFood(user.id, id, dto);
  }

  @Delete("foods/:id")
  @Roles("NUTRITIONIST")
  @HttpCode(204)
  async removeFood(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.catalog.removeFood(user.id, id);
  }

  @Get("recipes")
  @Roles("NUTRITIONIST")
  recipes(@CurrentUser() user: AuthUser) {
    return this.catalog.recipes(user.id);
  }

  @Get("recipes/:id")
  @Roles("NUTRITIONIST")
  recipe(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.catalog.recipe(user.id, id);
  }

  @Post("recipes")
  @Roles("NUTRITIONIST")
  createRecipe(@CurrentUser() user: AuthUser, @Body() dto: RecipeDto) {
    return this.catalog.saveRecipe(user.id, dto);
  }

  @Patch("recipes/:id")
  @Roles("NUTRITIONIST")
  updateRecipe(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: RecipeDto) {
    return this.catalog.saveRecipe(user.id, dto, id);
  }

  @Delete("recipes/:id")
  @Roles("NUTRITIONIST")
  @HttpCode(204)
  async removeRecipe(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.catalog.removeRecipe(user.id, id);
  }
}
