import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { DecimalInterceptor } from "./common/decimal.interceptor";

// Crea la aplicación configurada. La usan el servidor normal (main.ts) y la función de Vercel (serverless.ts).
export async function createApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  // Las fotos de comida llegan en base64; Vercel admite hasta 4.5 MB por petición.
  app.useBodyParser("json", { limit: "4mb" });
  app.useBodyParser("urlencoded", { extended: true, limit: "100kb" });

  // La plataforma pone un proxy delante; sin esto el límite de peticiones vería a todos con la misma IP.
  app.set("trust proxy", 1);
  app.enableCors({ exposedHeaders: ["Content-Disposition"] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalInterceptors(new DecimalInterceptor());
  return app;
}
