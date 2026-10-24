import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AccountModule } from "./account/account.module";
import { AdminModule } from "./admin/admin.controller";
import { AppointmentsModule } from "./appointments/appointments.module";
import { AuthModule } from "./auth/auth.module";
import { CatalogModule } from "./catalog/catalog.module";
import { JwtAuthGuard } from "./common/jwt-auth.guard";
import { RolesGuard } from "./common/roles";
import { config } from "./config";
import { ConsultationsModule } from "./consultations/consultations.module";
import { HealthController } from "./health/health.controller";
import { HomeModule } from "./home/home.controller";
import { MealPlansModule } from "./meal-plans/meal-plans.module";
import { PatientAppModule } from "./patient-app/patient-app.module";
import { PatientsModule } from "./patients/patients.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ReportsModule } from "./reports/reports.module";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 240 }]),
    JwtModule.register({
      global: true,
      secret: config.jwtSecret,
      signOptions: { expiresIn: config.accessTokenTtlSeconds },
    }),
    PrismaModule,
    AuthModule,
    AccountModule,
    CatalogModule,
    PatientsModule,
    AppointmentsModule,
    ConsultationsModule,
    MealPlansModule,
    ReportsModule,
    HomeModule,
    AdminModule,
    PatientAppModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
