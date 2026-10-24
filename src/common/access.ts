import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { SubscriptionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

// Devuelve el paciente solo si pertenece a la nutricionista; si no, responde 404
// (no se revela si existe en otra cuenta).
export async function ownedPatient(prisma: PrismaService, nutritionistId: string, patientId: string) {
  const patient = await prisma.patient.findFirst({ where: { id: patientId, nutritionistId } });
  if (!patient) throw new NotFoundException("Paciente no encontrado");
  return patient;
}

// Comprueba que la suscripción permite agregar pacientes nuevos.
export async function assertCanAddPatient(prisma: PrismaService, nutritionistId: string) {
  const subscription = await prisma.subscription.findUnique({ where: { userId: nutritionistId }, include: { plan: true } });
  if (!subscription) return;

  const expired = subscription.currentPeriodEnd !== null && subscription.currentPeriodEnd < new Date();
  if (subscription.status === SubscriptionStatus.CANCELLED || (subscription.status === SubscriptionStatus.TRIAL && expired)) {
    throw new ForbiddenException("Tu suscripción no está activa. Revisa tu plan en Configuración.");
  }

  const max = subscription.plan.maxPatients;
  if (max !== null) {
    const count = await prisma.patient.count({ where: { nutritionistId, archivedAt: null } });
    if (count >= max) {
      throw new ForbiddenException(`Tu plan ${subscription.plan.name} permite hasta ${max} pacientes activos.`);
    }
  }
}
