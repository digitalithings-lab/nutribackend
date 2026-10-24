import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";

export interface AuthUser {
  id: string;
  role: string;
}

export const IS_PUBLIC_KEY = "isPublic";

// Marca una ruta como accesible sin token.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
