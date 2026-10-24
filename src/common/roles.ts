import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import { AuthUser, IS_PUBLIC_KEY } from "./auth.decorators";

export const ROLES_KEY = "roles";

// Restringe una ruta (o un controlador entero) a ciertos roles.
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

// Guard global: se ejecuta después del de JWT. Sin @Roles(), la ruta es para cualquier usuario autenticado.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, targets);
    if (!roles || roles.length === 0) return true;

    const user: AuthUser | undefined = context.switchToHttp().getRequest().user;
    if (!user || !roles.includes(user.role as UserRole)) {
      throw new ForbiddenException("No tienes permiso para esta sección");
    }
    return true;
  }
}
