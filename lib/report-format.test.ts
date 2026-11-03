import assert from "node:assert/strict"
import test from "node:test"
import { PDFDocument, StandardFonts } from "pdf-lib"
import {
  createPdfTextSanitizer,
  formatBogotaDate,
  periodFilenameChunk,
  periodLabel,
  wrapText,
} from "./report-format"

async function setup() {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  return { font, clean: createPdfTextSanitizer(font) }
}

test("sanitizer keeps Spanish letters", async () => {
  const { clean } = await setup()
  assert.equal(clean("Peña Ñandú"), "Peña Ñandú")
  assert.equal(clean("Año al día"), "Año al día")
})

test("sanitizer turns decomposed accents into one letter (NFC)", async () => {
  const { clean } = await setup()
  const decomposed = "Pen\u0303a N\u0303andu\u0301"
  assert.notEqual(decomposed, "Peña Ñandú")
  assert.equal(clean(decomposed), "Peña Ñandú")
})

test("sanitizer replaces what the font cannot encode with ?", async () => {
  const { clean } = await setup()
  assert.equal(clean("Ana 😀"), "Ana ?")
  assert.equal(clean("Łukasz"), "?ukasz")
})

test("sanitizer turns tabs and newlines into spaces", async () => {
  const { clean } = await setup()
  assert.equal(clean("Ana\nGómez\tPérez\r\nSoto"), "Ana Gómez Pérez Soto")
})

test("a sanitized string can be drawn with the font", async () => {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const clean = createPdfTextSanitizer(font)
  assert.doesNotThrow(() => page.drawText(clean("Ł 😀 \n Ñ"), { font, size: 9 }))
  assert.throws(() => page.drawText("Ł", { font, size: 9 }))
})

test("wrapText wraps by width and breaks very long words", async () => {
  const { font } = await setup()
  const lines = wrapText("Maria Fernanda Rodriguez Hernandez", font, 9, 80)
  assert.ok(lines.length > 1)
  for (const line of lines) assert.ok(font.widthOfTextAtSize(line, 9) <= 80)
  const email = "una.direccion.de.correo.muy.larga.sin.espacios@ejemplo-dominio.com"
  const emailLines = wrapText(email, font, 8, 90)
  assert.ok(emailLines.length > 1)
  for (const line of emailLines) assert.ok(font.widthOfTextAtSize(line, 8) <= 90)
  assert.equal(emailLines.join(""), email)
})

test("dates use America/Bogota", () => {
  // 03:00 UTC on 1 Nov is 22:00 on 31 Oct in Bogota
  assert.equal(formatBogotaDate("2026-11-01T03:00:00Z"), "31/10/2026")
  assert.equal(formatBogotaDate("2026-11-01T05:00:00Z"), "01/11/2026")
  assert.equal(formatBogotaDate(undefined), "")
  assert.equal(formatBogotaDate("not a date"), "")
})

test("period label and filename chunk", () => {
  const jul = { year: 2026, month: 7 }
  const oct = { year: 2026, month: 10 }
  assert.equal(periodLabel({ from: jul, to: oct }), "Periodo: Julio 2026 a Octubre 2026")
  assert.equal(periodLabel({ from: oct, to: oct }), "Periodo: Octubre 2026")
  assert.equal(periodLabel({ from: jul }), "Periodo: desde Julio 2026")
  assert.equal(periodLabel({ to: oct }), "Periodo: hasta Octubre 2026")
  assert.equal(periodLabel({}), "Periodo: Todos")
  assert.equal(periodFilenameChunk({ from: jul, to: oct }), "2026-07-a-2026-10")
  assert.equal(periodFilenameChunk({ from: oct, to: oct }), "2026-10")
  assert.equal(periodFilenameChunk({ from: jul }), "desde-2026-07")
  assert.equal(periodFilenameChunk({}), "")
})
