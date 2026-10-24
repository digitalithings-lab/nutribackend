import type { Request, Response } from "express";
import { createApp } from "./app.factory";

type Handler = (req: Request, res: Response) => void;

// En Vercel cada instancia de la función crea la aplicación una sola vez y la reutiliza.
let server: Promise<Handler> | undefined;

export default async function handler(req: Request, res: Response) {
  server ??= createApp().then(async (app) => {
    await app.init();
    return app.getHttpAdapter().getInstance() as Handler;
  });
  try {
    (await server)(req, res);
  } catch (err) {
    // Permite reintentar en la siguiente petición (p. ej. si la base de datos no respondía).
    server = undefined;
    throw err;
  }
}
