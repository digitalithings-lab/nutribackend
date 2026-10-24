import { Body, Controller, Get, Post } from "@nestjs/common";
import { IsString, Length } from "class-validator";
import { AuthUser, CurrentUser } from "../common/auth.decorators";
import { Trim } from "../common/dto";
import { PrismaService } from "../prisma/prisma.service";

export class CreateTicketDto {
  @Trim() @IsString() @Length(3, 120) subject: string;
  @Trim() @IsString() @Length(5, 4000) message: string;
}

// Solicitudes de soporte de la nutricionista al equipo de administración.
@Controller("support")
export class SupportController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.supportTicket.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto) {
    return this.prisma.supportTicket.create({ data: { userId: user.id, subject: dto.subject, message: dto.message } });
  }
}
