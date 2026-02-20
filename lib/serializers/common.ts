export function toIsoDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "string") return value
  return ""
}

