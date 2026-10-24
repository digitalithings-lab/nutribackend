import { Controller, Get, Module } from "@nestjs/common";
import { AuthUser, CurrentUser } from "../common/auth.decorators";
import { Roles } from "../common/roles";
import { PrismaService } from "../prisma/prisma.service";

const FOLLOW_UP_DAYS = 30;

// Resumen del panel principal de la nutricionista.
@Controller("home")
@Roles("NUTRITIONIST")
export class HomeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async summary(@CurrentUser() user: AuthUser) {
    const startOfDay = new Date(new Date().setHours(0, 0, 0, 0));
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    const followUpLimit = new Date(Date.now() - FOLLOW_UP_DAYS * 24 * 60 * 60 * 1000);
    const nutritionistId = user.id;

    const [activePatients, today, upcoming, draftPlans, patients] = await Promise.all([
      this.prisma.patient.count({ where: { nutritionistId, archivedAt: null } }),
      this.prisma.appointment.findMany({
        where: { nutritionistId, startsAt: { gte: startOfDay, lt: endOfDay }, status: { not: "CANCELLED" } },
        orderBy: { startsAt: "asc" },
        include: { patient: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.appointment.findMany({
        where: { nutritionistId, startsAt: { gte: endOfDay }, status: "SCHEDULED" },
        orderBy: { startsAt: "asc" },
        take: 8,
        include: { patient: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.mealPlan.findMany({
        where: { nutritionistId, status: "DRAFT" },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: {
          id: true,
          title: true,
          targetKcal: true,
          updatedAt: true,
          patient: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      // Pacientes activos sin consulta reciente ni cita programada: necesitan seguimiento.
      this.prisma.patient.findMany({
        where: {
          nutritionistId,
          archivedAt: null,
          appointments: { none: { startsAt: { gte: new Date() }, status: "SCHEDULED" } },
          consultations: { some: {}, none: { date: { gte: followUpLimit } } },
        },
        take: 10,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          consultations: { orderBy: { date: "desc" }, take: 1, select: { date: true } },
        },
      }),
    ]);

    return {
      stats: {
        activePatients,
        appointmentsToday: today.length,
        pendingFollowUps: patients.length,
        plansToReview: draftPlans.length,
      },
      today,
      upcoming,
      draftPlans,
      followUps: patients.map((p) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        lastConsultation: p.consultations[0]?.date ?? null,
      })),
    };
  }
}

@Module({ controllers: [HomeController] })
export class HomeModule {}
