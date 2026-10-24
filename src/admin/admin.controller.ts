import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { FoodSource, Prisma, SubscriptionStatus, TicketStatus, UserStatus } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { FoodDto } from "../catalog/catalog.controller";
import { Roles } from "../common/roles";
import { PrismaService } from "../prisma/prisma.service";

export class UserStatusDto {
  @IsEnum(UserStatus) status: UserStatus;
}

export class SubscriptionDto {
  @IsUUID() planId: string;
  @IsEnum(SubscriptionStatus) status: SubscriptionStatus;
  @IsOptional() @IsISO8601() currentPeriodEnd?: string | null;
  @IsOptional() @IsString() @MaxLength(500) notes?: string | null;
}

export class PlanDto {
  @Matches(/^[A-Z0-9_]{2,30}$/, { message: "El código debe ir en mayúsculas, sin espacios" }) code: string;
  @IsString() @Length(2, 60) name: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string | null;
  @IsInt() @Min(0) @Max(1_000_000) priceCents: number;
  @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100_000) maxPatients?: number | null;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(120, { each: true }) features?: string[];
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

export class TicketReplyDto {
  @IsOptional() @IsString() @Length(1, 4000) reply?: string;
  @IsEnum(TicketStatus) status: TicketStatus;
}

export class ExchangeGroupDto {
  @IsOptional() @IsString() @Length(2, 60) name?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1000) kcal?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(200) choG?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(200) proG?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(200) fatG?: number;
  @IsOptional() @IsString() @MaxLength(120) portionHint?: string | null;
}

export class CatalogFoodDto extends FoodDto {
  @IsEnum(FoodSource) source: FoodSource;
  @IsOptional() @IsBoolean() active?: boolean;
}

// Administración general: cuentas, planes comerciales, soporte y catálogo.
// No expone datos clínicos de los pacientes; solo conteos.
@Controller("admin")
@Roles("ADMIN")
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("overview")
  async overview() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [nutritionists, newSignups, byStatus, patients, plans, openTickets, active] = await Promise.all([
      this.prisma.user.count({ where: { role: "NUTRITIONIST" } }),
      this.prisma.user.count({ where: { role: "NUTRITIONIST", createdAt: { gte: since } } }),
      this.prisma.subscription.groupBy({ by: ["status"], _count: true }),
      this.prisma.patient.count({ where: { archivedAt: null } }),
      this.prisma.mealPlan.count({ where: { status: "APPROVED" } }),
      this.prisma.supportTicket.count({ where: { status: "OPEN" } }),
      this.prisma.subscription.findMany({ where: { status: "ACTIVE" }, include: { plan: true } }),
    ]);
    return {
      nutritionists,
      newSignups,
      subscriptions: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      activePatients: patients,
      approvedPlans: plans,
      openTickets,
      // Ingreso mensual estimado de las suscripciones activas.
      monthlyRevenueCents: active.reduce((sum, s) => sum + s.plan.priceCents, 0),
    };
  }

  @Get("users")
  async users(@Query("search") search?: string) {
    const term = search?.trim();
    const users = await this.prisma.user.findMany({
      where: term
        ? {
            OR: [
              { fullName: { contains: term, mode: "insensitive" } },
              { email: { contains: term, mode: "insensitive" } },
              { clinicName: { contains: term, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        subscription: { include: { plan: true } },
        _count: { select: { patients: true, mealPlans: true } },
      },
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      status: u.status,
      clinicName: u.clinicName,
      phone: u.phone,
      licenseNumber: u.licenseNumber,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      patients: u._count.patients,
      mealPlans: u._count.mealPlans,
      subscription: u.subscription && {
        planId: u.subscription.planId,
        planName: u.subscription.plan.name,
        status: u.subscription.status,
        currentPeriodEnd: u.subscription.currentPeriodEnd,
        notes: u.subscription.notes,
      },
    }));
  }

  @Patch("users/:id/status")
  async setStatus(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UserStatusDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("Cuenta no encontrada");
    if (user.role === "ADMIN") throw new BadRequestException("No se puede suspender una cuenta de administración");
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { status: dto.status } }),
      // Al suspender se cierran sus sesiones.
      ...(dto.status === UserStatus.SUSPENDED
        ? [this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })]
        : []),
    ]);
    return { id, status: dto.status };
  }

  @Put("users/:id/subscription")
  async setSubscription(@Param("id", ParseUUIDPipe) id: string, @Body() dto: SubscriptionDto) {
    await this.prisma.user.findUniqueOrThrow({ where: { id } }).catch(() => {
      throw new NotFoundException("Cuenta no encontrada");
    });
    const data = {
      planId: dto.planId,
      status: dto.status,
      currentPeriodEnd: dto.currentPeriodEnd ? new Date(dto.currentPeriodEnd) : null,
      notes: dto.notes ?? null,
    };
    return this.prisma.subscription.upsert({
      where: { userId: id },
      create: { ...data, userId: id },
      update: data,
      include: { plan: true },
    });
  }

  // ─── Planes comerciales ───

  @Get("plans")
  plans() {
    return this.prisma.subscriptionPlan.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { subscriptions: true } } },
    });
  }

  @Post("plans")
  createPlan(@Body() dto: PlanDto) {
    return this.prisma.subscriptionPlan.create({ data: dto }).catch(conflict("Ya existe un plan con ese código"));
  }

  @Patch("plans/:id")
  updatePlan(@Param("id", ParseUUIDPipe) id: string, @Body() dto: PlanDto) {
    return this.prisma.subscriptionPlan.update({ where: { id }, data: dto }).catch(conflict("Ya existe un plan con ese código"));
  }

  // ─── Soporte ───

  @Get("tickets")
  tickets(@Query("status") status?: string) {
    const valid = Object.values(TicketStatus).includes(status as TicketStatus) ? (status as TicketStatus) : undefined;
    return this.prisma.supportTicket.findMany({
      where: { status: valid },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });
  }

  @Patch("tickets/:id")
  reply(@Param("id", ParseUUIDPipe) id: string, @Body() dto: TicketReplyDto) {
    return this.prisma.supportTicket.update({
      where: { id },
      data: { status: dto.status, ...(dto.reply ? { reply: dto.reply, repliedAt: new Date() } : {}) },
    });
  }

  // ─── Catálogo: equivalencias y alimentos generales ───

  @Patch("exchange-groups/:id")
  updateGroup(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ExchangeGroupDto) {
    return this.prisma.exchangeGroup.update({ where: { id }, data: dto });
  }

  @Post("foods")
  createFood(@Body() dto: CatalogFoodDto) {
    if (dto.source === FoodSource.CUSTOM) throw new BadRequestException("Los alimentos del catálogo son tradicionales o de Panamá");
    return this.prisma.food.create({ data: dto });
  }

  @Patch("foods/:id")
  async updateFood(@Param("id", ParseUUIDPipe) id: string, @Body() dto: CatalogFoodDto) {
    const food = await this.prisma.food.findFirst({ where: { id, nutritionistId: null } });
    if (!food) throw new NotFoundException("Alimento del catálogo no encontrado");
    return this.prisma.food.update({ where: { id }, data: dto });
  }
}

function conflict(message: string) {
  return (err: unknown) => {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new BadRequestException(message);
    throw err;
  };
}

@Module({ controllers: [AdminController] })
export class AdminModule {}
