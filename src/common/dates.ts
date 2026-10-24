// Fechas sin hora (YYYY-MM-DD) guardadas a mediodía UTC para que no cambien de día por zona horaria.
export function dateFromString(value: string): Date {
  return new Date(`${value}T12:00:00Z`);
}

export function dateToString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function num(value: { toNumber(): number } | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? value : value.toNumber();
}
