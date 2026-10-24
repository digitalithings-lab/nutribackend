import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { lowercaseTrim } from "../common/dto";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = "La fecha debe tener formato YYYY-MM-DD";

export class RegisterPatientDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toUpperCase().replace(/[\s-]/g, "") : value))
  @Length(6, 12, { message: "El código de invitación no es válido" })
  code: string;

  @Transform(lowercaseTrim)
  @IsEmail({}, { message: "El correo no es válido" })
  email: string;

  @IsString()
  @MinLength(8, { message: "La contraseña debe tener al menos 8 caracteres" })
  @MaxLength(128)
  password: string;

  // Obligatorios cuando el código es el de la nutricionista (se crea un expediente nuevo).
  @IsOptional() @IsString() @Length(1, 60) firstName?: string;
  @IsOptional() @IsString() @Length(1, 60) lastName?: string;
  @IsOptional() @IsIn(["FEMALE", "MALE"]) sex?: "FEMALE" | "MALE";
  @IsOptional() @Matches(DATE, { message: DATE_MESSAGE }) birthDate?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
}

export class AppointmentRequestDto {
  @IsISO8601({}, { message: "La fecha y hora no son válidas" }) startsAt: string;
  @IsOptional() @IsIn(["FIRST_VISIT", "CONTROL", "FOLLOW_UP"]) type?: "FIRST_VISIT" | "CONTROL" | "FOLLOW_UP";
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class FoodScanDto {
  // Imagen JPEG o PNG en base64, sin el prefijo data:.
  @IsString()
  @MinLength(100)
  @MaxLength(4_000_000, { message: "La foto es demasiado grande" })
  image: string;

  @IsOptional() @IsIn(["image/jpeg", "image/png", "image/webp"]) mimeType?: string;
  @IsOptional() @Matches(DATE, { message: DATE_MESSAGE }) date?: string;
  @IsOptional() @IsString() @MaxLength(40) mealName?: string;
  // Aclaración opcional del paciente ("es una porción pequeña", "sin azúcar").
  @IsOptional() @IsString() @MaxLength(200) hint?: string;
}

export class FoodItemDto {
  @IsString() @Length(1, 100) name: string;
  @IsOptional() @IsString() @MaxLength(80) portion?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(5000) grams?: number | null;
  @Type(() => Number) @IsNumber() @Min(0) @Max(5000) kcal: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(1000) choG: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(1000) proG: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(1000) fatG: number;
}

export class FoodLogDto {
  @Matches(DATE, { message: DATE_MESSAGE }) date: string;
  @IsOptional() @IsString() @MaxLength(40) mealName?: string;
  @IsString() @Length(1, 200) description: string;
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => FoodItemDto)
  items: FoodItemDto[];
  @IsOptional() @IsIn(["PHOTO", "MANUAL"]) source?: "PHOTO" | "MANUAL";
  @IsOptional() @IsIn(["low", "medium", "high"]) confidence?: string;
}

export class WeightDto {
  @Matches(DATE, { message: DATE_MESSAGE }) date: string;
  @Type(() => Number) @IsNumber() @Min(20) @Max(400) weightKg: number;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}
