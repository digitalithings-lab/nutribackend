import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { FileKind } from "@prisma/client";
import { SkipThrottle } from "@nestjs/throttler";
import { IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from "class-validator";
import type { Response } from "express";
import { ownedPatient } from "../common/access";
import { AuthUser, CurrentUser, Public } from "../common/auth.decorators";
import { Roles } from "../common/roles";
import { PrismaService } from "../prisma/prisma.service";

// Los archivos se guardan en la base porque Vercel no tiene disco persistente.
// Vercel acepta peticiones de hasta 4.5 MB; en base64 un archivo crece un tercio.
export const MAX_FILE_BYTES = 3 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PATIENT_FILE_TYPES = [...IMAGE_TYPES, "application/pdf"];

export class UploadDto {
  @IsString() @Length(1, 120) name: string;
  @IsString() @MaxLength(60) mimeType: string;
  // Contenido en base64, sin el prefijo data:.
  @IsString() @MaxLength(4_300_000, { message: "El archivo supera 3 MB" }) data: string;
  @IsOptional() @IsUUID() labResultId?: string;
}

export class ImageDto {
  @IsIn(IMAGE_TYPES, { message: "La imagen debe ser JPG, PNG o WebP" }) mimeType: string;
  @IsString() @MaxLength(4_300_000, { message: "La imagen supera 3 MB" }) data: string;
}

function decode(data: string, allowed: string[], mimeType: string): Buffer {
  if (!allowed.includes(mimeType)) throw new BadRequestException("Tipo de archivo no permitido. Usa PDF, JPG, PNG o WebP.");
  const buffer = Buffer.from(data, "base64");
  if (!buffer.length) throw new BadRequestException("El archivo está vacío");
  if (buffer.length > MAX_FILE_BYTES) throw new BadRequestException("El archivo supera 3 MB");
  return buffer;
}

const META = { id: true, kind: true, name: true, mimeType: true, size: true, labResultId: true, createdAt: true } as const;

@Injectable()
export class FilesService {
  constructor(private readonly prisma: PrismaService) {}

  async uploadPatientFile(nutritionistId: string, patientId: string, dto: UploadDto) {
    await ownedPatient(this.prisma, nutritionistId, patientId);
    if (dto.labResultId) {
      const lab = await this.prisma.labResult.findFirst({ where: { id: dto.labResultId, patientId } });
      if (!lab) throw new BadRequestException("El examen no es de este paciente");
    }
    const data = decode(dto.data, PATIENT_FILE_TYPES, dto.mimeType);
    return this.prisma.storedFile.create({
      data: {
        kind: FileKind.PATIENT_FILE,
        ownerId: nutritionistId,
        patientId,
        labResultId: dto.labResultId,
        name: dto.name.trim(),
        mimeType: dto.mimeType,
        size: data.length,
        data,
      },
      select: META,
    });
  }

  async listPatientFiles(nutritionistId: string, patientId: string) {
    await ownedPatient(this.prisma, nutritionistId, patientId);
    return this.prisma.storedFile.findMany({
      where: { patientId, kind: FileKind.PATIENT_FILE },
      orderBy: { createdAt: "desc" },
      select: META,
    });
  }

  // Adjunto del expediente: lo ve la nutricionista dueña del paciente.
  async patientFile(nutritionistId: string, id: string) {
    const file = await this.prisma.storedFile.findFirst({
      where: { id, kind: FileKind.PATIENT_FILE, patient: { nutritionistId } },
    });
    if (!file) throw new NotFoundException("Archivo no encontrado");
    return file;
  }

  async removePatientFile(nutritionistId: string, id: string) {
    await this.patientFile(nutritionistId, id);
    await this.prisma.storedFile.delete({ where: { id } });
  }

  // Foto de un alimento: la nutricionista en sus propios alimentos; la administración en el catálogo.
  async setFoodImage(user: AuthUser, foodId: string, dto: ImageDto) {
    const food = await this.editableFood(user, foodId);
    const data = decode(dto.data, IMAGE_TYPES, dto.mimeType);
    return this.prisma.$transaction(async (tx) => {
      const image = await tx.storedFile.create({
        data: { kind: FileKind.FOOD_IMAGE, ownerId: user.id, name: `alimento-${food.id}`, mimeType: dto.mimeType, size: data.length, data },
        select: { id: true },
      });
      await tx.food.update({ where: { id: food.id }, data: { imageId: image.id } });
      if (food.imageId) await tx.storedFile.delete({ where: { id: food.imageId } });
      return { imageId: image.id };
    });
  }

  async removeFoodImage(user: AuthUser, foodId: string) {
    const food = await this.editableFood(user, foodId);
    if (!food.imageId) return;
    await this.prisma.$transaction([
      this.prisma.food.update({ where: { id: food.id }, data: { imageId: null } }),
      this.prisma.storedFile.delete({ where: { id: food.imageId } }),
    ]);
  }

  private async editableFood(user: AuthUser, foodId: string) {
    const food = await this.prisma.food.findUnique({ where: { id: foodId } });
    const allowed = food && (user.role === "ADMIN" ? food.nutritionistId === null : food.nutritionistId === user.id);
    if (!food || !allowed) throw new NotFoundException("Alimento no encontrado o no puedes editarlo");
    return food;
  }

  // Las fotos de alimentos son públicas (solo se llega con su id) para poder mostrarlas en <img>.
  async publicImage(id: string) {
    const file = await this.prisma.storedFile.findFirst({ where: { id, kind: FileKind.FOOD_IMAGE } });
    if (!file) throw new NotFoundException("Imagen no encontrada");
    return file;
  }
}

function send(res: Response, file: { data: Uint8Array; mimeType: string; name: string }, cache: string) {
  res.set({
    "Content-Type": file.mimeType,
    "Content-Disposition": `inline; filename="${encodeURIComponent(file.name)}"`,
    "Cache-Control": cache,
  });
  return new StreamableFile(Buffer.from(file.data));
}

@Controller()
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get("patients/:id/files")
  @Roles("NUTRITIONIST")
  list(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.files.listPatientFiles(user.id, id);
  }

  @Post("patients/:id/files")
  @Roles("NUTRITIONIST")
  upload(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UploadDto) {
    return this.files.uploadPatientFile(user.id, id, dto);
  }

  @Get("files/:id")
  @Roles("NUTRITIONIST")
  async download(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    return send(res, await this.files.patientFile(user.id, id), "private, no-store");
  }

  @Delete("files/:id")
  @Roles("NUTRITIONIST")
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.files.removePatientFile(user.id, id);
  }

  @Post("foods/:id/image")
  @Roles("NUTRITIONIST", "ADMIN")
  setImage(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ImageDto) {
    return this.files.setFoodImage(user, id, dto);
  }

  @Delete("foods/:id/image")
  @Roles("NUTRITIONIST", "ADMIN")
  @HttpCode(204)
  async removeImage(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.files.removeFoodImage(user, id);
  }

  @Public()
  @SkipThrottle()
  @Get("images/:id")
  async image(@Param("id", ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    // El id cambia cuando se reemplaza la foto, así que se puede guardar en caché mucho tiempo.
    return send(res, await this.files.publicImage(id), "public, max-age=31536000, immutable");
  }
}

@Module({ controllers: [FilesController], providers: [FilesService] })
export class FilesModule {}
