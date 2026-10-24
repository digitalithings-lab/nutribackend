import { Logger } from "@nestjs/common";
import { createApp } from "./app.factory";
import { config } from "./config";

// Servidor normal (desarrollo local o plataformas con procesos permanentes).
async function bootstrap() {
  const app = await createApp();
  app.enableShutdownHooks();
  await app.listen(config.port, "0.0.0.0");
  Logger.log(`NutriPro backend escuchando en el puerto ${config.port}`, "Bootstrap");
}

bootstrap();
