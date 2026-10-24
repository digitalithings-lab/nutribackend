import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { config } from "../config";

export interface FoodItemEstimate {
  name: string;
  portion: string;
  grams: number | null;
  kcal: number;
  choG: number;
  proG: number;
  fatG: number;
}

export interface FoodEstimate {
  isFood: boolean;
  description: string;
  items: FoodItemEstimate[];
  confidence: "low" | "medium" | "high";
  notes: string | null;
}

const SYSTEM_PROMPT = `Eres un asistente de nutrición que estima el contenido de comidas a partir de fotos.
Contexto: pacientes en Panamá; reconoce platos y alimentos panameños (arroz con pollo, patacones, yuca, sancocho, hojaldre, carimañola, tortilla de maíz, frijoles, guandú, plátano maduro, etc.).
Estima la porción que se VE en la foto (no una porción estándar) usando referencias visuales como platos, cubiertos o manos.
Si la foto muestra una etiqueta nutricional, usa sus valores por porción.
Responde SOLO con JSON con esta forma exacta:
{"isFood": boolean, "description": string, "items": [{"name": string, "portion": string, "grams": number|null, "kcal": number, "choG": number, "proG": number, "fatG": number}], "confidence": "low"|"medium"|"high", "notes": string|null}
- description: resumen corto del plato en español.
- portion: cantidad en medidas caseras (p. ej. "1 taza", "2 unidades medianas").
- choG, proG y fatG en gramos; kcal coherente con ellos (4/4/9).
- Si no es comida, isFood=false e items=[].
- notes: dudas importantes (aceite no visible, salsas, tamaño incierto) o null.`;

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : 0;
}

// Estimación de calorías y macronutrientes de una foto con un modelo de visión de Groq.
@Injectable()
export class FoodVision {
  private readonly logger = new Logger(FoodVision.name);

  get model() {
    return config.groq.visionModel;
  }

  async analyze(imageBase64: string, mimeType: string, hint?: string): Promise<FoodEstimate> {
    if (!config.groq.apiKey) throw new ServiceUnavailableException("El análisis de fotos no está configurado");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.groq.timeoutMs);
    try {
      const res = await fetch(`${config.groq.baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${config.groq.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          max_tokens: 1200,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: hint ? `Analiza la foto. El paciente indica: ${hint}` : "Analiza la foto." },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
              ],
            },
          ],
        }),
      });
      if (!res.ok) {
        this.logger.warn(`Groq respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
        if (res.status === 429) throw new ServiceUnavailableException("Hay muchas fotos en proceso. Intenta de nuevo en un minuto.");
        throw new BadGatewayException("No pudimos analizar la foto. Intenta de nuevo.");
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return this.parse(data.choices?.[0]?.message?.content ?? "");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new ServiceUnavailableException("El análisis tardó demasiado. Intenta de nuevo.");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private parse(content: string): FoodEstimate {
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(content.replace(/^```(json)?|```$/g, "").trim());
    } catch {
      this.logger.warn(`Respuesta no JSON: ${content.slice(0, 200)}`);
      throw new BadGatewayException("No pudimos interpretar el análisis. Intenta con otra foto.");
    }
    const items = Array.isArray(raw.items) ? raw.items : [];
    const confidence = ["low", "medium", "high"].includes(String(raw.confidence)) ? (raw.confidence as FoodEstimate["confidence"]) : "low";
    return {
      isFood: raw.isFood !== false && items.length > 0,
      description: String(raw.description ?? "").slice(0, 200),
      items: items.slice(0, 15).map((i: Record<string, unknown>) => ({
        name: String(i.name ?? "Alimento").slice(0, 100),
        portion: String(i.portion ?? "").slice(0, 80),
        grams: i.grams === null || i.grams === undefined ? null : toNumber(i.grams),
        kcal: Math.round(toNumber(i.kcal)),
        choG: toNumber(i.choG),
        proG: toNumber(i.proG),
        fatG: toNumber(i.fatG),
      })),
      confidence,
      notes: raw.notes ? String(raw.notes).slice(0, 400) : null,
    };
  }
}
