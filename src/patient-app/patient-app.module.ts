import { Module } from "@nestjs/common";
import { MealPlansModule } from "../meal-plans/meal-plans.module";
import { PatientsModule } from "../patients/patients.module";
import { FoodVision } from "./food-vision";
import { PatientAccessController, PatientAppController } from "./patient-app.controller";
import { PatientAppService } from "./patient-app.service";

@Module({
  imports: [MealPlansModule, PatientsModule],
  controllers: [PatientAccessController, PatientAppController],
  providers: [PatientAppService, FoodVision],
})
export class PatientAppModule {}
