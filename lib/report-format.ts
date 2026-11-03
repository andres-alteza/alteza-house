import type { PDFFont } from "pdf-lib"
import { toMonthKey, type MonthRange, type YearMonth } from "./payment-periods"

export const MONTH_LABELS = [
  "",
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
]

const BOGOTA = "America/Bogota"

export function monthLabel(value: YearMonth) {
  return `${MONTH_LABELS[value.month] ?? value.month} ${value.year}`
}

/** "Periodo: Julio 2026 a Octubre 2026" (one month: "Periodo: Octubre 2026"). */
export function periodLabel(range: MonthRange) {
  const { from, to } = range
  if (from && to) {
    if (from.year === to.year && from.month === to.month) return `Periodo: ${monthLabel(from)}`
    return `Periodo: ${monthLabel(from)} a ${monthLabel(to)}`
  }
  if (from) return `Periodo: desde ${monthLabel(from)}`
  if (to) return `Periodo: hasta ${monthLabel(to)}`
  return "Periodo: Todos"
}

/** Filename chunk: 2026-08, 2026-07-a-2026-10, desde-2026-07, hasta-2026-10. */
export function periodFilenameChunk(range: MonthRange) {
  const { from, to } = range
  const key = (value: YearMonth) => toMonthKey(value.year, value.month)
  if (from && to) return key(from) === key(to) ? key(from) : `${key(from)}-a-${key(to)}`
  if (from) return `desde-${key(from)}`
  if (to) return `hasta-${key(to)}`
  return ""
}

export function formatBogotaDate(value: string | Date | undefined | null) {
  if (!value) return ""
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: BOGOTA,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date)
}

export function formatBogotaDateTime(value: Date) {
  return value.toLocaleString("es-CO", { timeZone: BOGOTA })
}

/**
 * Makes text safe for a standard PDF font: NFC (so a + combining accent becomes one letter),
 * tabs and line breaks become spaces, and anything the font cannot encode becomes "?".
 * Spanish letters like á é ñ stay as they are.
 */
export function createPdfTextSanitizer(font: PDFFont) {
  const supported = new Set(font.getCharacterSet())
  return (value: unknown) => {
    const text = String(value ?? "")
      .normalize("NFC")
      .replace(/[\t\r\n\v\f]+/g, " ")
    let out = ""
    for (const char of text) {
      out += supported.has(char.codePointAt(0) as number) ? char : "?"
    }
    return out.replace(/ {2,}/g, " ").trim()
  }
}

/** Wraps already sanitized text to a pixel width, breaking words that are wider than the column. */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  if (!text) return [""]
  const lines: string[] = []
  let line = ""
  const widthOf = (value: string) => font.widthOfTextAtSize(value, size)

  const pushLong = (word: string) => {
    let chunk = ""
    for (const char of word) {
      if (chunk && widthOf(chunk + char) > maxWidth) {
        lines.push(chunk)
        chunk = char
      } else {
        chunk += char
      }
    }
    return chunk
  }

  for (const word of text.split(" ")) {
    const candidate = line ? `${line} ${word}` : word
    if (widthOf(candidate) <= maxWidth) {
      line = candidate
      continue
    }
    if (line) lines.push(line)
    line = widthOf(word) <= maxWidth ? word : pushLong(word)
  }
  if (line) lines.push(line)
  return lines.length ? lines : [""]
}
