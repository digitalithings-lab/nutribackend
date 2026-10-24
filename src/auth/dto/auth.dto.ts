import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, Length, MaxLength, MinLength } from "class-validator";
import { lowercaseTrim } from "../../common/dto";

export class RegisterDto {
  @Transform(lowercaseTrim)
  @IsEmail({}, { message: "El correo no es válido" })
  email: string;

  @IsString()
  @MinLength(8, { message: "La contraseña debe tener al menos 8 caracteres" })
  @MaxLength(128)
  password: string;

  @IsString()
  @Length(3, 80, { message: "Escribe tu nombre completo" })
  fullName: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  licenseNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  clinicName?: string;
}

export class LoginDto {
  @Transform(lowercaseTrim)
  @IsEmail({}, { message: "El correo no es válido" })
  email: string;

  @IsString()
  @MaxLength(128)
  password: string;
}

export class RefreshDto {
  @IsString()
  @MaxLength(200)
  refreshToken: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(128)
  currentPassword: string;

  @IsString()
  @MinLength(8, { message: "La contraseña nueva debe tener al menos 8 caracteres" })
  @MaxLength(128)
  newPassword: string;
}
