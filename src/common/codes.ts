import { randomInt } from "node:crypto";

// Sin 0/O ni 1/I para que los códigos se puedan dictar sin confusiones.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomCode(length = 8): string {
  return Array.from({ length }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

// Normaliza lo que escribe el usuario: mayúsculas, sin espacios ni guiones.
export function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]/g, "");
}
