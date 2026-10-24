import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma, SubscriptionStatus, User, UserRole, UserStatus } from "@prisma/client";
import { hashPassword, randomToken, sha256, verifyPassword } from "../common/crypto";
import { config } from "../config";
import { PrismaService } from "../prisma/prisma.service";
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
