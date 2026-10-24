import { Module } from "@nestjs/common";
import { ConsultationsModule } from "../consultations/consultations.module";
import { MealPlansModule } from "../meal-plans/meal-plans.module";
import { PatientsModule } from "../patients/patients.module";
import { ReportsController, ReportsService } from "./reports.controller";

@Module({
  imports: [ConsultationsModule, MealPlansModule, PatientsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
