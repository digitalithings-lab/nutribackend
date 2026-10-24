import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthUser, CurrentUser } from "../common/auth.decorators";
import { Roles } from "../common/roles";
import { FoodLogDto, FoodScanDto, WeightDto } from "./patient-app.dto";
import { PatientAppService } from "./patient-app.service";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value?: string) => (value && DATE.test(value) ? value : undefined);

// Acceso a la app desde el expediente (nutricionista).
@Controller("patients/:id")
@Roles("NUTRITIONIST")
export class PatientAccessController {
  constructor(private readonly app: PatientAppService) {}

  @Post("app-invite")
  invite(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.app.createInvite(user.id, id);
  }

  @Delete("app-access")
  @HttpCode(204)
  async revoke(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.app.revokeAccess(user.id, id);
  }

  @Get("app-activity")
  activity(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Query("days") days?: string) {
    return this.app.activity(user.id, id, Math.min(Math.max(Number(days) || 14, 1), 90));
  }
}

// Rutas de la app móvil del paciente.
@Controller("me")
@Roles("PATIENT")
export class PatientAppController {
  constructor(private readonly app: PatientAppService) {}

  @Get()
  me(@CurrentUser() user: AuthUser) {
    return this.app.me(user.id);
  }

  @Get("plan")
  plan(@CurrentUser() user: AuthUser) {
    return this.app.plan(user.id);
  }

  @Get("exchange-list")
  exchangeList(@CurrentUser() user: AuthUser) {
    return this.app.exchangeList(user.id);
  }

  @Get("day")
  day(@CurrentUser() user: AuthUser, @Query("date") date?: string) {
    return this.app.day(user.id, validDate(date));
  }

  // Más estricto: cada foto consume una llamada al modelo de visión.
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post("food-scans")
  @HttpCode(200)
  scan(@CurrentUser() user: AuthUser, @Body() dto: FoodScanDto) {
    return this.app.scan(user.id, dto);
  }

  @Get("food-logs")
  foodLogs(@CurrentUser() user: AuthUser, @Query("from") from?: string, @Query("to") to?: string) {
    return this.app.foodLogs(user.id, validDate(from), validDate(to));
  }

  @Post("food-logs")
  addFoodLog(@CurrentUser() user: AuthUser, @Body() dto: FoodLogDto) {
    return this.app.addFoodLog(user.id, dto);
  }

  @Delete("food-logs/:logId")
  @HttpCode(204)
  async removeFoodLog(@CurrentUser() user: AuthUser, @Param("logId", ParseUUIDPipe) id: string) {
    await this.app.removeFoodLog(user.id, id);
  }

  @Get("progress")
  progress(@CurrentUser() user: AuthUser) {
    return this.app.progress(user.id);
  }

  @Post("weights")
  addWeight(@CurrentUser() user: AuthUser, @Body() dto: WeightDto) {
    return this.app.addWeight(user.id, dto);
  }

  @Delete("weights/:weightId")
  @HttpCode(204)
  async removeWeight(@CurrentUser() user: AuthUser, @Param("weightId", ParseUUIDPipe) id: string) {
    await this.app.removeWeight(user.id, id);
  }

  @Get("appointments")
  appointments(@CurrentUser() user: AuthUser) {
    return this.app.appointments(user.id);
  }
}
