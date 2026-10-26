import { applyDecorators } from "@nestjs/common";
import { CalorieMethod, EnergyEquation, ExchangeMode, Sex } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

const n = (min: number, max: number) => applyDecorators(IsOptional(), Type(() => Number), IsNumber(), Min(min), Max(max));

export class CreateMealPlanDto {
  @IsOptional() @IsUUID() consultationId?: string;
  @IsOptional() @IsString() @Length(2, 100) title?: string;
}

export class ExerciseDto {
  @IsString() @Length(1, 40) type: string;
  @Type(() => Number) @IsNumber() @Min(1) @Max(20) met: number;
  @IsInt() @Min(1) @Max(7) daysPerWeek: number;
  @IsInt() @Min(5) @Max(600) minutes: number;
}

export class ActivityDetailDto {
  // Nivel de la actividad laboral o diaria, sin contar el ejercicio.
  @IsOptional() @IsString() @MaxLength(80) occupation?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(24) sedentaryHours?: number;
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ExerciseDto)
  exercises: ExerciseDto[];
}

export class EnergyDto {
  @IsEnum(CalorieMethod) calorieMethod: CalorieMethod;
  @IsOptional() @IsEnum(EnergyEquation) equation?: EnergyEquation;
  @n(1, 400) weightKg?: number;
  @n(30, 250) heightCm?: number;
  @IsOptional() @IsInt() @Min(0) @Max(120) ageYears?: number;
  @IsOptional() @IsEnum(Sex) sex?: Sex;
  @n(1, 75) bodyFatPct?: number;
  @n(5, 80) kcalPerKg?: number;
  @n(1, 2.5) activityFactor?: number;
  @n(1, 2) stressFactor?: number;
  // Peso para el cálculo: AUTO (según IMC), ACTUAL, IDEAL o ADJUSTED.
  @IsOptional() @IsIn(["AUTO", "ACTUAL", "IDEAL", "ADJUSTED"]) weightBasis?: "AUTO" | "ACTUAL" | "IDEAL" | "ADJUSTED";
  @IsOptional() @IsString() @MaxLength(20) physiologicalStage?: string;
  @IsOptional() @ValidateNested() @Type(() => ActivityDetailDto) activityDetail?: ActivityDetailDto | null;
  @IsOptional() @IsInt() @Min(-50) @Max(50) adjustmentPct?: number | null;
  @IsOptional() @IsInt() @Min(-2000) @Max(2000) adjustmentKcal?: number | null;
  // Obligatorio en modo manual.
  @IsOptional() @IsInt() @Min(500) @Max(8000) targetKcal?: number;
}

export class MacrosDto {
  @IsInt() @Min(0) @Max(100) choPct: number;
  @IsInt() @Min(0) @Max(100) proPct: number;
  @IsInt() @Min(0) @Max(100) fatPct: number;
}

export class ExchangeModeDto {
  @IsEnum(ExchangeMode) exchangeMode: ExchangeMode;
}

export class ExchangesDto {
  // { "CEREALS": 6, "FRUITS": 3, ... }
  @IsObject() servings: Record<string, number>;
}

export class MealDto {
  @IsOptional() @IsUUID() id?: string;
  @IsString() @Length(1, 40) name: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "La hora debe tener formato HH:MM" }) time?: string | null;
  @IsOptional() @IsObject() exchanges?: Record<string, number>;
  @IsOptional() @IsString() @MaxLength(500) notes?: string | null;
}

export class MealsDto {
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => MealDto)
  meals: MealDto[];
}

export class ItemDto {
  @IsOptional() @IsUUID() foodId?: string;
  @IsOptional() @IsUUID() recipeId?: string;
  @IsOptional() @IsString() @Length(1, 100) customName?: string;
  @Type(() => Number) @IsNumber() @Min(0.25) @Max(50) servings: number;
  @IsOptional() @IsUUID() substituteOfId?: string;
  @IsOptional() @IsString() @MaxLength(300) notes?: string;
}

export class UpdateItemDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.25) @Max(50) servings?: number;
  @IsOptional() @IsString() @MaxLength(300) notes?: string | null;
}

export class UpdateMealPlanDto {
  @IsOptional() @IsString() @Length(2, 100) title?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(200, { each: true }) objectives?: string[];
  @IsOptional() @IsString() @MaxLength(6000) recommendations?: string | null;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string | null;
}

export class ApproveDto {
  // La nutricionista confirma que aprueba aunque haya diferencias con el objetivo.
  @IsOptional() @IsBoolean() acknowledgeWarnings?: boolean;
}

export class ShoppingExtraDto {
  @IsString() @Length(1, 80) name: string;
  @IsOptional() @IsString() @MaxLength(40) quantity?: string;
  @IsOptional() @IsString() @MaxLength(120) note?: string;
}

export class ShoppingExtrasDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ShoppingExtraDto)
  extras: ShoppingExtraDto[];
}
