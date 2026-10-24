import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from "@nestjs/common";
import { AuthUser, CurrentUser } from "../common/auth.decorators";
import { Roles } from "../common/roles";
import {
  BackgroundDto,
  DietHistoryDto,
  LabResultDto,
  MedicationDto,
  PatientDto,
  UpdatePatientDto,
} from "./patients.dto";
import { PatientsService } from "./patients.service";

@Controller("patients")
@Roles("NUTRITIONIST")
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("search") search?: string, @Query("archived") archived?: string) {
    return this.patients.list(user.id, search, archived === "true");
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: PatientDto) {
    return this.patients.create(user.id, dto);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.patients.get(user.id, id);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdatePatientDto) {
    return this.patients.update(user.id, id, dto);
  }

  @Post(":id/archive")
  @HttpCode(200)
  archive(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.patients.setArchived(user.id, id, true);
  }

  @Post(":id/restore")
  @HttpCode(200)
  restore(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.patients.setArchived(user.id, id, false);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.patients.remove(user.id, id);
  }

  @Put(":id/background")
  background(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: BackgroundDto) {
    return this.patients.saveBackground(user.id, id, dto);
  }

  @Put(":id/diet-history")
  dietHistory(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: DietHistoryDto) {
    return this.patients.saveDietHistory(user.id, id, dto);
  }

  @Get(":id/evolution")
  evolution(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.patients.evolution(user.id, id);
  }

  @Post(":id/labs")
  addLab(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: LabResultDto) {
    return this.patients.addLab(user.id, id, dto);
  }

  @Put(":id/labs/:labId")
  updateLab(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("labId", ParseUUIDPipe) labId: string,
    @Body() dto: LabResultDto,
  ) {
    return this.patients.updateLab(user.id, id, labId, dto);
  }

  @Delete(":id/labs/:labId")
  @HttpCode(204)
  async removeLab(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("labId", ParseUUIDPipe) labId: string,
  ) {
    await this.patients.removeLab(user.id, id, labId);
  }

  @Post(":id/medications")
  addMedication(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: MedicationDto) {
    return this.patients.addMedication(user.id, id, dto);
  }

  @Put(":id/medications/:medicationId")
  updateMedication(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("medicationId", ParseUUIDPipe) medicationId: string,
    @Body() dto: MedicationDto,
  ) {
    return this.patients.updateMedication(user.id, id, medicationId, dto);
  }

  @Delete(":id/medications/:medicationId")
  @HttpCode(204)
  async removeMedication(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("medicationId", ParseUUIDPipe) medicationId: string,
  ) {
    await this.patients.removeMedication(user.id, id, medicationId);
  }
}
