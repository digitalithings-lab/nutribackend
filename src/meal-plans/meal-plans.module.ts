import { Module } from "@nestjs/common";
import { MealPlansController } from "./meal-plans.controller";
import { MealPlansService } from "./meal-plans.service";

@Module({
  controllers: [MealPlansController],
  providers: [MealPlansService],
  exports: [MealPlansService],
})
export class MealPlansModule {}
