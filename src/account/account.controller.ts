import { BadRequestException, Body, Controller, Get, Patch } from "@nestjs/common";
import { EnergyEquation, ExchangeMode } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from "class-validator";
import { publicUser } from "../auth/auth.service";
import { AuthUser, CurrentUser, Public } from "../common/auth.decorators";
import { EmptyToUndefined } from "../common/dto";
import { Roles } from "../common/roles";
import { PrismaService } from "../prisma/prisma.service";

export class UpdateAccountDto {
  @IsOptional() @IsString() @Length(3, 80) fullName?: string;
  @IsOptional() @EmptyToUndefined() @IsString() @MaxLength(40) licenseNumber?: string;
  @IsOptional() @EmptyToUndefined() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @EmptyToUndefined() @IsString() @MaxLength(80) clinicName?: string;
  @IsOptional() @EmptyToUndefined() @IsString() @MaxLength(160) clinicAddress?: string;
  @IsOptional() @IsString() @MaxLength(60) timezone?: string;
  @IsOptional() @IsEnum(EnergyEquation) defaultEquation?: EnergyEquation;
  @IsOptional() @IsEnum(ExchangeMode) defaultExchangeMode?: ExchangeMode;
  @IsOptional() @IsInt() @Min(0) @Max(100) defaultChoPct?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) defaultProPct?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) defaultFatPct?: number;
}

@Controller()
export class AccountController {
  constructor(private readonly prisma: PrismaService) {}

  // Planes disponibles (pública, para la página de registro).
  @Public()
  @Get("plans")
  plans() {
    return this.prisma.subscriptionPlan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  }

  @Get("account")
  @Roles("NUTRITIONIST", "ADMIN")
  async get(@CurrentUser() user: AuthUser) {
    const [account, patients] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { subscription: { include: { plan: true } } } }),
      this.prisma.patient.count({ where: { nutritionistId: user.id, archivedAt: null } }),
    ]);
    return { ...publicUser(account), usage: { activePatients: patients } };
  }

  @Patch("account")
  @Roles("NUTRITIONIST", "ADMIN")
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateAccountDto) {
    const current = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const cho = dto.defaultChoPct ?? current.defaultChoPct;
    const pro = dto.defaultProPct ?? current.defaultProPct;
    const fat = dto.defaultFatPct ?? current.defaultFatPct;
    if (cho + pro + fat !== 100) throw new BadRequestException("La distribución de macronutrientes debe sumar 100 %");
    if (dto.timezone && !isValidTimezone(dto.timezone)) throw new BadRequestException("La zona horaria no es válida");

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { ...dto, fullName: dto.fullName?.trim() },
      include: { subscription: { include: { plan: true } } },
    });
    return publicUser(updated);
  }
}

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("es", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
