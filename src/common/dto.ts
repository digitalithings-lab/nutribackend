import { Transform } from "class-transformer";

// Convierte "" en undefined para que los campos opcionales vacíos de un formulario no fallen la validación.
export const EmptyToUndefined = () =>
  Transform(({ value }) => (typeof value === "string" && value.trim() === "" ? undefined : value));

export const Trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));

export const lowercaseTrim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim().toLowerCase() : value;
