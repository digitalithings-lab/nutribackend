import { Body, Controller, Get, Headers, HttpCode, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthUser, CurrentUser, Public } from "../common/auth.decorators";
import { RegisterPatientDto } from "../patient-app/patient-app.dto";
import { AuthService } from "./auth.service";
import { ChangePasswordDto, LoginDto, RefreshDto, RegisterDto } from "./dto/auth.dto";

// Límite más estricto en las rutas públicas para frenar ataques de fuerza bruta.
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post("register")
  register(@Body() dto: RegisterDto, @Headers("x-device-name") deviceName?: string) {
    return this.auth.register(dto, deviceName);
  }

  // La app consulta el código antes de pedir los datos del paciente.
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Get("link-code/:code")
  lookupCode(@Param("code") code: string) {
    return this.auth.lookupCode(code.slice(0, 20));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post("register-patient")
  registerPatient(@Body() dto: RegisterPatientDto, @Headers("x-device-name") deviceName?: string) {
    return this.auth.registerPatient(dto, deviceName);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post("login")
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Headers("x-device-name") deviceName?: string) {
    return this.auth.login(dto, deviceName);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post("refresh")
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post("logout")
  @HttpCode(204)
  async logout(@Body() dto: RefreshDto) {
    await this.auth.logout(dto.refreshToken);
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Throttle(AUTH_THROTTLE)
  @Post("change-password")
  @HttpCode(204)
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(user.id, dto);
  }
}
