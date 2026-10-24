import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { map } from "rxjs";

// Prisma devuelve las columnas Decimal como objetos que se serializan como texto.
// Este interceptor los convierte en números antes de responder.
function convert(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toNumber();
  if (Array.isArray(value)) return value.map(convert);
  // Solo se recorren objetos planos (no fechas, buffers ni archivos).
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = convert(v);
  return out;
}

@Injectable()
export class DecimalInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(map(convert));
  }
}
