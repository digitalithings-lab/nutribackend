import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma, SubscriptionStatus, User, UserRole, UserStatus } from "@prisma/client";
import { assertCanAddPatient } from "../common/access";
import { normalizeCode, randomCode } from "../common/codes";
import { hashPassword, randomToken, sha256, verifyPassword } from "../common/crypto";
import { dateFromString } from "../common/dates";
import { config } from "../config";
import { PrismaService } from "../prisma/prisma.service";
import { RegisterPatientDto } from "../patient-app/patient-app.dto";
import { ChangePasswordDto, LoginDto, RegisterDto } from "./dto/auth.dto";

// Hash de una contraseña que nunca coincide; se usa para que un correo inexistente
// tarde lo mismo en responder que uno existente.
const DUMMY_HASH_PROMISE = hashPassword(randomToken());

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // Registro de una nutricionista: cuenta propia con periodo de prueba.
  async register(dto: RegisterDto, deviceName?: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { code: config.defaultPlanCode } });
    const passwordHash = await hashPassword(dto.password);

    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          fullName: dto.fullName.trim(),
          licenseNumber: dto.licenseNumber?.trim() || null,
          phone: dto.phone?.trim() || null,
          clinicName: dto.clinicName?.trim() || null,
          linkCode: randomCode(6),
          subscription: plan
            ? {
                create: {
                  planId: plan.id,
                  status: SubscriptionStatus.TRIAL,
                  currentPeriodEnd: new Date(Date.now() + config.trialDays * 24 * 60 * 60 * 1000),
                },
              }
            : undefined,
        },
      });
      return this.issueTokens(user, deviceName);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Ya existe una cuenta con ese correo");
      }
      throw err;
    }
  }

  // Qué representa un código: la invitación a un expediente existente o el código de una nutricionista.
  async lookupCode(rawCode: string) {
    const code = normalizeCode(rawCode);
    const patient = await this.prisma.patient.findUnique({
      where: { inviteCode: code },
      include: { nutritionist: { select: { fullName: true, clinicName: true } } },
    });
    if (patient && !patient.userId && patient.inviteExpiresAt && patient.inviteExpiresAt > new Date()) {
      return { type: "INVITE" as const, firstName: patient.firstName, nutritionist: patient.nutritionist };
    }
    const nutritionist = await this.prisma.user.findUnique({ where: { linkCode: code } });
    if (nutritionist && nutritionist.role === UserRole.NUTRITIONIST && nutritionist.status === UserStatus.ACTIVE) {
      return { type: "NUTRITIONIST" as const, nutritionist: { fullName: nutritionist.fullName, clinicName: nutritionist.clinicName } };
    }
    throw new NotFoundException("El código no es válido o ya venció. Pídele uno a tu nutricionista.");
  }

  // Activación de la app de un paciente. Con el código de invitación se vincula a su expediente;
  // con el código de la nutricionista se crea un expediente nuevo con sus datos.
  async registerPatient(dto: RegisterPatientDto, deviceName?: string) {
    // Sin código la cuenta queda sin nutricionista; se vincula después desde la app.
    const lookup = dto.code ? await this.lookupCode(dto.code) : null;
    const code = dto.code ? normalizeCode(dto.code) : null;
    const passwordHash = await hashPassword(dto.password);

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        if (lookup?.type === "INVITE") {
          const patient = await tx.patient.findUniqueOrThrow({ where: { inviteCode: code! } });
          const created = await tx.user.create({
            data: { email: dto.email, passwordHash, role: UserRole.PATIENT, fullName: `${patient.firstName} ${patient.lastName}` },
          });
          // El updateMany con userId null evita que dos registros usen el mismo código a la vez.
          const linked = await tx.patient.updateMany({
            where: { id: patient.id, userId: null },
            data: { userId: created.id, inviteCode: null, inviteExpiresAt: null },
          });
          if (linked.count === 0) throw new ConflictException("Este código ya se usó");
          return created;
        }

        if (!dto.firstName?.trim() || !dto.lastName?.trim() || !dto.sex || !dto.birthDate) {
          throw new BadRequestException("Completa tu nombre, apellido, sexo y fecha de nacimiento");
        }
        const birthDate = dateFromString(dto.birthDate);
        if (Number.isNaN(birthDate.getTime()) || birthDate > new Date()) {
          throw new BadRequestException("La fecha de nacimiento no es válida");
        }
        const nutritionist = code ? await tx.user.findUniqueOrThrow({ where: { linkCode: code } }) : null;
        if (nutritionist) await assertCanAddPatient(this.prisma, nutritionist.id);
        const created = await tx.user.create({
          data: {
            email: dto.email,
            passwordHash,
            role: UserRole.PATIENT,
            fullName: `${dto.firstName.trim()} ${dto.lastName.trim()}`,
          },
        });
        await tx.patient.create({
          data: {
            nutritionistId: nutritionist?.id ?? null,
            userId: created.id,
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            sex: dto.sex,
            birthDate,
            email: dto.email,
            phone: dto.phone?.trim() || null,
            createdFromApp: !!nutritionist,
          },
        });
        return created;
      });
      return this.issueTokens(user, deviceName);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Ya existe una cuenta con ese correo");
      }
      throw err;
    }
  }

  async login(dto: LoginDto, deviceName?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    const valid = user
      ? await verifyPassword(dto.password, user.passwordHash)
      : await verifyPassword(dto.password, await DUMMY_HASH_PROMISE).then(() => false);

    if (!user || !valid) {
      throw new UnauthorizedException("Correo o contraseña incorrectos");
    }
    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException("Tu cuenta está suspendida. Escribe a soporte para reactivarla.");
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issueTokens(user, deviceName);
  }

  // Rota el refresh token: el usado se revoca y se entrega uno nuevo.
  async refresh(refreshToken: string) {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: sha256(refreshToken) },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date() || session.user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("La sesión expiró, vuelve a iniciar sesión");
    }

    const revoked = await this.prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) {
      // Otro proceso ya usó este token al mismo tiempo.
      throw new UnauthorizedException("La sesión expiró, vuelve a iniciar sesión");
    }

    return this.issueTokens(session.user, session.deviceName ?? undefined);
  }

  async logout(refreshToken: string) {
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verifyPassword(dto.currentPassword, user.passwordHash))) {
      throw new BadRequestException("La contraseña actual no es correcta");
    }
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(dto.newPassword) } });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: { include: { plan: true } } },
    });
    if (!user) {
      throw new NotFoundException("La cuenta no existe");
    }
    return publicUser(user);
  }

  private async issueTokens(user: User, deviceName?: string) {
    // Los correos de ADMIN_EMAILS obtienen el rol de administración al iniciar sesión.
    if (config.adminEmails.includes(user.email) && user.role !== UserRole.ADMIN) {
      user = await this.prisma.user.update({ where: { id: user.id }, data: { role: UserRole.ADMIN } });
    }

    const refreshToken = randomToken();
    const expiresAt = new Date(Date.now() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000);

    await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: sha256(refreshToken),
        deviceName: deviceName?.slice(0, 100),
        expiresAt,
      },
    });

    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role });

    return {
      accessToken,
      accessTokenExpiresIn: config.accessTokenTtlSeconds,
      refreshToken,
      refreshTokenExpiresAt: expiresAt,
      user: await this.me(user.id),
    };
  }
}

export function publicUser(user: Prisma.UserGetPayload<{ include: { subscription: { include: { plan: true } } } }>) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    fullName: user.fullName,
    licenseNumber: user.licenseNumber,
    phone: user.phone,
    clinicName: user.clinicName,
    clinicAddress: user.clinicAddress,
    linkCode: user.linkCode,
    country: user.country,
    timezone: user.timezone,
    defaults: {
      equation: user.defaultEquation,
      exchangeMode: user.defaultExchangeMode,
      choPct: user.defaultChoPct,
      proPct: user.defaultProPct,
      fatPct: user.defaultFatPct,
    },
    subscription: user.subscription && {
      status: user.subscription.status,
      currentPeriodEnd: user.subscription.currentPeriodEnd,
      plan: {
        code: user.subscription.plan.code,
        name: user.subscription.plan.name,
        maxPatients: user.subscription.plan.maxPatients,
      },
    },
    createdAt: user.createdAt,
  };
}
