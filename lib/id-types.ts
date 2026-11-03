export const ID_TYPE_OPTIONS = [
  { value: "CC", label: "Cédula de Ciudadanía (CC)" },
  { value: "TI", label: "Tarjeta de Identidad (TI)" },
  { value: "RC", label: "Registro Civil de Nacimiento (RC)" },
  { value: "CE", label: "Cédula de Extranjería (CE)" },
  { value: "PP", label: "Pasaporte (PP)" },
  { value: "PEP", label: "Permiso Especial de Permanencia (PEP)" },
  { value: "NIT", label: "NIT" },
] as const

const KNOWN_ID_TYPES = new Set<string>(ID_TYPE_OPTIONS.map((option) => option.value))

/** Known types are shown as their canonical code; an unknown type is shown as stored. */
export function idTypeCode(rawType: unknown) {
  const raw = String(rawType ?? "").trim()
  const upper = raw.toUpperCase()
  return KNOWN_ID_TYPES.has(upper) ? upper : raw
}

/** "TI 1234", or just the number when there is no type, or "sin documento" when the number is empty. */
export function formatIdDocument(rawType: unknown, rawNumber: unknown) {
  const number = String(rawNumber ?? "").trim()
  if (!number) return "sin documento"
  return `${idTypeCode(rawType)} ${number}`.trim()
}
