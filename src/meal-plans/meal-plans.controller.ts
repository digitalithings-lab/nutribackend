import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from "@nestjs/common";
import { AuthUser, CurrentUser } from "../common/auth.decorators";
import { Roles } from "../common/roles";
import {
  ApproveDto,
  CreateMealPlanDto,
  EnergyDto,
  ExchangeModeDto,
  ExchangesDto,
  ItemDto,
  MacrosDto,
  MealsDto,
  UpdateItemDto,
  UpdateMealPlanDto,
} from "./meal-plans.dto";
import { MealPlansService } from "./meal-plans.service";

const Id = () => Param("id", ParseUUIDPipe);

@Controller()
@Roles("NUTRITIONIST")
export class MealPlansController {
  constructor(private readonly plans: MealPlansService) {}

  @Get("patients/:patientId/meal-plans")
  list(@CurrentUser() user: AuthUser, @Param("patientId", ParseUUIDPipe) patientId: string) {
    return this.plans.list(user.id, patientId);
  }

  @Post("patients/:patientId/meal-plans")
  create(@CurrentUser() user: AuthUser, @Param("patientId", ParseUUIDPipe) patientId: string, @Body() dto: CreateMealPlanDto) {
    return this.plans.create(user.id, patientId, dto);
  }

  @Get("meal-plans/:id")
  get(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.plans.detail(user.id, id);
  }

  @Patch("meal-plans/:id")
  update(@CurrentUser() user: AuthUser, @Id() id: string, @Body() dto: UpdateMealPlanDto) {
    return this.plans.update(user.id, id, dto);
  }

  @Delete("meal-plans/:id")
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Id() id: string) {
    await this.plans.remove(user.id, id);
  }

  @Put("meal-plans/:id/energy")
  energy(@CurrentUser() user: AuthUser, @Id() id: string, @Body() dto: EnergyDto) {
    return this.plans.setEnergy(user.id, id, dto);
  }

  @Put("meal-plans/:id/macros")
  macros(@CurrentUser() user: AuthUser, @Id() id: string, @Body() dto: MacrosDto) {
    return this.plans.setMacros(user.id, id, dto);
  }

  @Put("meal-plans/:id/exchange-mode")
  exchangeMode(@CurrentUser() user: AuthUser, @Id() id: string, @Body() dto: ExchangeModeDto) {
    return this.plans.setExchangeMode(user.id, id, dto.exchangeMode);
  }

  @Post("meal-plans/:id/suggest-exchanges")
  @HttpCode(200)
  suggest(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.plans.suggest(user.id, id);
  }

  @Put("meal-plans/:id/exchanges")
  exchanges(@CurrentUser() user: AuthUser, @Id() id: string, @Body() dto: ExchangesDto) {
    return this.plans.setExchanges(user.id, id, dto);
  }

  @Post("meal-plans/:id/distribute")
  @HttpCode(200)
  distribute(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.plans.distribute(user.id, id);
  }

  @Put("meal-plans/:id/meals")
  meals(@CurrentUser() user: AuthUser, @Id() id: string, @Body() dto: MealsDto) {
    return this.plans.setMeals(user.id, id, dto);
  }

  @Post("meal-plans/:id/meals/:mealId/items")
  addItem(
    @CurrentUser() user: AuthUser,
    @Id() id: string,
    @Param("mealId", ParseUUIDPipe) mealId: string,
    @Body() dto: ItemDto,
  ) {
    return this.plans.addItem(user.id, id, mealId, dto);
  }

  @Patch("meal-plans/:id/items/:itemId")
  updateItem(
    @CurrentUser() user: AuthUser,
    @Id() id: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateItemDto,
  ) {
    return this.plans.updateItem(user.id, id, itemId, dto);
  }

  @Delete("meal-plans/:id/items/:itemId")
  removeItem(@CurrentUser() user: AuthUser, @Id() id: string, @Param("itemId", ParseUUIDPipe) itemId: string) {
    return this.plans.removeItem(user.id, id, itemId);
  }

  @Post("meal-plans/:id/approve")
  @HttpCode(200)
  approve(@CurrentUser() user: AuthUser, @Id() id: string, @Body() dto: ApproveDto) {
    return this.plans.approve(user.id, id, dto);
  }

  @Post("meal-plans/:id/reopen")
  @HttpCode(200)
  reopen(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.plans.reopen(user.id, id);
  }

  @Post("meal-plans/:id/duplicate")
  duplicate(@CurrentUser() user: AuthUser, @Id() id: string, @Query("consultationId", new ParseUUIDPipe({ optional: true })) consultationId?: string) {
    return this.plans.duplicate(user.id, id, consultationId);
  }
}
