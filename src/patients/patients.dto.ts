import { applyDecorators } from "@nestjs/common";
import { Sex } from "@prisma/client";
import { IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from "class-validator";
import { EmptyToUndefined, Trim } from "../common/dto";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = "La fecha debe tener formato YYYY-MM-DD";

export class PatientDto {
  @Trim() @IsString() @Length(1, 60) firstName: string;
  @Trim() @IsString() @Length(1, 60) lastName: string;
  @IsEnum(Sex) sex: Sex;
  @Matches(DATE, { message: DATE_MESSAGE }) birthDate: string;
  @IsOptional() @EmptyToUndefined() @IsString() @MaxLength(30) documentId?: string;
  @IsOptional() @EmptyToUndefined() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @EmptyToUndefined() @IsEmail({}, { message: "El correo no es válido" }) email?: string;
  @IsOptional() @EmptyToUndefined() @IsString() @MaxLength(80) occupation?: string;
  @IsOptional() @EmptyToUndefined() @IsString() @MaxLength(200) address?: string;
  @IsOptional() @EmptyToUndefined() @IsString() @MaxLength(1000) reason?: string;
  @IsOptional() @EmptyToUndefined() @IsString() @MaxLength(1000) goal?: string;
  @IsOptional() @EmptyToUndefined() @IsString() @MaxLength(4000) notes?: string;
}

export class UpdatePatientDto {
  @IsOptional() @Trim() @IsString() @Length(1, 60) firstName?: string;
  @IsOptional() @Trim() @IsString() @Length(1, 60) lastName?: string;
  @IsOptional() @IsEnum(Sex) sex?: Sex;
  @IsOptional() @Matches(DATE, { message: DATE_MESSAGE }) birthDate?: string;
  @IsOptional() @IsString() @MaxLength(30) documentId?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @EmptyToUndefined() @IsEmail({}, { message: "El correo no es válido" }) email?: string;
  @IsOptional() @IsString() @MaxLength(80) occupation?: string;
  @IsOptional() @IsString() @MaxLength(200) address?: string;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
  @IsOptional() @IsString() @MaxLength(1000) goal?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}

// Campo de texto libre opcional del expediente.
const text = () => applyDecorators(IsOptional(), IsString(), MaxLength(4000));

export class BackgroundDto {
  @text() pathological?: string;
  @text() family?: string;
  @text() surgical?: string;
  @text() allergies?: string;
  @text() intolerances?: string;
  @text() gastrointestinal?: string;
  @text() gynecological?: string;
  @text() smoking?: string;
  @text() alcohol?: string;
  @text() physicalActivity?: string;
  @text() sleep?: string;
  @text() stress?: string;
  @text() notes?: string;
}

export class DietHistoryDto {
  @IsOptional() @IsInt() @Min(1) @Max(10) mealsPerDay?: number;
  @text() recall24h?: string;
  @text() foodFrequency?: string;
  @text() preferences?: string;
  @text() aversions?: string;
  @text() waterIntake?: string;
  @text() appetite?: string;
  @text() eatsOutside?: string;
  @text() whoCooks?: string;
  @text() supplements?: string;
  @text() previousDiets?: string;
  @text() notes?: string;
}

export class LabResultDto {
  @Matches(DATE, { message: DATE_MESSAGE }) takenOn: string;
  @Trim() @IsString() @Length(1, 80) name: string;
  @Trim() @IsString() @Length(1, 40) value: string;
  @IsOptional() @EmptyToUndefined() @IsString() @MaxLength(20) unit?: string;
  @IsOptional() @EmptyToUndefined() @IsString() @MaxLength(60) reference?: string;
  @IsOptional() @EmptyToUndefined() @IsString() @MaxLength(500) notes?: string;
}

export class MedicationDto {
  @Trim() @IsString() @Length(1, 100) name: string;
  @IsOptional() @EmptyToUndefined() @IsString() @MaxLength(60) dose?: string;
  @IsOptional() @EmptyToUndefined() @IsString() @MaxLength(60) frequency?: string;
  @IsOptional() @IsBoolean() isSupplement?: boolean;
  @IsOptional() @EmptyToUndefined() @Matches(DATE, { message: DATE_MESSAGE }) startedOn?: string;
  @IsOptional() @EmptyToUndefined() @Matches(DATE, { message: DATE_MESSAGE }) endedOn?: string;
  @IsOptional() @EmptyToUndefined() @IsString() @MaxLength(500) notes?: string;
}
