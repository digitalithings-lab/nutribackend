// Configuración leída de variables de entorno. Falla al arrancar si falta algo
// imprescindible, para no descubrirlo a mitad de una petición.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) {
    throw new Error(`La variable de entorno ${name} debe ser un número`);
  }
  return value;
}

export const config = {
  port: int("PORT", 3000),
  jwtSecret: required("JWT_SECRET"),
  accessTokenTtlSeconds: int("ACCESS_TOKEN_TTL_SECONDS", 15 * 60),
  refreshTokenTtlDays: int("REFRESH_TOKEN_TTL_DAYS", 30),
  // Correos con acceso de administración, separados por comas.
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
  // Días de prueba al registrarse.
  trialDays: int("TRIAL_DAYS", 14),
  // Plan asignado a las cuentas nuevas.
  defaultPlanCode: process.env.DEFAULT_PLAN_CODE ?? "BASICO",
  // Días de vigencia del código para que un paciente active la app.
  inviteDays: int("PATIENT_INVITE_DAYS", 14),
  groq: {
    apiKey: process.env.GROQ_API_KEY ?? "",
    baseUrl: process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1",
    // Modelo con visión para analizar fotos de comida.
    visionModel: process.env.GROQ_VISION_MODEL ?? "qwen/qwen3.8-27b",
    timeoutMs: int("GROQ_TIMEOUT_MS", 30_000),
  },
  // Fotos analizadas por paciente al día.
  foodScanDailyLimit: int("FOOD_SCAN_DAILY_LIMIT", 25),
};
