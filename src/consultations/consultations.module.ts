import { Module } from "@nestjs/common";
import { ConsultationsController, ConsultationsService } from "./consultations.controller";

@Module({
  controllers: [ConsultationsController],
  providers: [ConsultationsService],
  exports: [ConsultationsService],
})
export class ConsultationsModule {}
