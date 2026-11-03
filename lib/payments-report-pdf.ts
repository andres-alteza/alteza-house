import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib"
import { groupPaymentsByMonthAndHouse } from "./group-payments"
import type { PaymentReportRow, ReportDetail, ReportFilters } from "./payment-report-rows"
import type { MonthRange } from "./payment-periods"
import {
  MONTH_LABELS,
  createPdfTextSanitizer,
  formatBogotaDate,
  formatBogotaDateTime,
  periodFilenameChunk,
  periodLabel,
  wrapText,
} from "./report-format"

export type PaymentsReportPdfResult = {
  bytes: Uint8Array
  filename: string
  filtersLabel: string
  subject: string
}

function formatCurrency(value: number) {
  return `$${value.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function slugifyChunk(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
}

function stateLabel(state: PaymentReportRow["state"]) {
  if (state === "approved") return "Pagado"
  if (state === "pending") return "Comprobante pendiente"
  return "Sin pago"
}

function reportKind(state: ReportFilters["state"]) {
  if (state === "approved") return "paid"
  if (state === "pending") return "unpaid"
  return "all"
}

function reportTitle(state: ReportFilters["state"]) {
  if (state === "approved") return "Inquilinos al día"
  if (state === "pending") return "Inquilinos con deudas"
  return "Reporte de pagos"
}

function emptyMessage(state: ReportFilters["state"]) {
  if (state === "approved") return "No hay inquilinos al día para el periodo seleccionado."
  if (state === "pending") return "No hay inquilinos con deudas para los filtros seleccionados."
  return "No se encontraron pagos con los filtros seleccionados."
}

type Line = { text: string; size: number; font: PDFFont; color?: ReturnType<typeof rgb> }

type Column = {
  key: "tenant" | "payer" | "document" | "month" | "createdAt" | "state" | "amount"
  header: string[]
  width: number
  align?: "right"
}

const FULL_COLUMNS: Column[] = [
  { key: "tenant", header: ["Inquilino", "Correo (inquilino)"], width: 190 },
  { key: "payer", header: ["Acudiente", "(pagador)"], width: 140 },
  { key: "document", header: ["Documento", "acudiente"], width: 92 },
  { key: "month", header: ["Mes", "cubierto"], width: 86 },
  { key: "createdAt", header: ["Fecha de", "registro"], width: 66 },
  { key: "state", header: ["Estado"], width: 80 },
  { key: "amount", header: ["Valor"], width: 108, align: "right" },
]

// Cron email version: no acudiente name, document or tenant email.
const SUMMARY_COLUMNS: Column[] = [
  { key: "tenant", header: ["Inquilino"], width: 270 },
  { key: "month", header: ["Mes", "cubierto"], width: 110 },
  { key: "createdAt", header: ["Fecha de", "registro"], width: 100 },
  { key: "state", header: ["Estado"], width: 130 },
  { key: "amount", header: ["Valor"], width: 152, align: "right" },
]

export async function renderPaymentsReportPdf({
  rows,
  state = "approved",
  houseLabel,
  tenantLabel,
  period = {},
  detail = "summary",
  cutoff,
  generatedAt = new Date(),
}: {
  rows: PaymentReportRow[]
  state?: ReportFilters["state"]
  houseLabel: string
  tenantLabel: string
  period?: MonthRange
  detail?: ReportDetail
  cutoff: { year: number; month: number }
  generatedAt?: Date
}): Promise<PaymentsReportPdfResult> {
  const grouped = groupPaymentsByMonthAndHouse(rows)
  const pdf = await PDFDocument.create()
  const pageWidth = 842
  const pageHeight = 595
  const margin = 40
  const contentWidth = pageWidth - margin * 2
  const amountHeader = state === "pending" ? "Valor pendiente" : "Valor pagado"
  const columns = (detail === "full" ? FULL_COLUMNS : SUMMARY_COLUMNS).map((column) =>
    column.key === "amount" ? { ...column, header: [amountHeader] } : column
  )
  const cellPad = 4

  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const clean = createPdfTextSanitizer(regular)
  const gray = rgb(0.4, 0.4, 0.4)

  let page = pdf.addPage([pageWidth, pageHeight])
  let cursorY = pageHeight - margin
  const stateLabelText = state === "all" ? "Todos" : state === "approved" ? "Al día" : "Con deudas"

  const filtersLabel = [
    `Casa: ${houseLabel}`,
    `Inquilino: ${tenantLabel}`,
    periodLabel(period),
    `Estado: ${stateLabelText}`,
    state === "pending" ? `Corte: hasta ${MONTH_LABELS[cutoff.month]} ${cutoff.year}` : undefined,
  ]
    .filter(Boolean)
    .join(" | ")

  const title = reportTitle(state)
  const filterLines = wrapText(clean(filtersLabel), regular, 10, contentWidth)
  const headerHeight = 22 + filterLines.length * 13 + 26

  const drawPageHeader = () => {
    page.drawText(clean(title), {
      x: margin,
      y: pageHeight - margin,
      size: 18,
      font: bold,
      color: rgb(0.12, 0.12, 0.12),
    })
    filterLines.forEach((line, index) => {
      page.drawText(line, {
        x: margin,
        y: pageHeight - margin - 22 - index * 13,
        size: 10,
        font: regular,
        color: rgb(0.3, 0.3, 0.3),
      })
    })
    page.drawText(`Generado: ${clean(formatBogotaDateTime(generatedAt))}`, {
      x: margin,
      y: pageHeight - margin - 22 - filterLines.length * 13,
      size: 10,
      font: regular,
      color: rgb(0.35, 0.35, 0.35),
    })
  }

  let inTable = false

  const ensureRoom = (needed: number) => {
    if (cursorY - needed < margin) {
      page = pdf.addPage([pageWidth, pageHeight])
      cursorY = pageHeight - margin
      drawPageHeader()
      cursorY -= headerHeight
      if (inTable) drawTableHeader()
    }
  }

  const lineHeight = (line: Line) => line.size + 2.5

  const cellLines = (lines: Line[], width: number): Line[] =>
    lines.flatMap((line) =>
      wrapText(line.text, line.font, line.size, width - cellPad * 2).map((text) => ({ ...line, text }))
    )

  const cellsFor = (row: PaymentReportRow): Record<Column["key"], Line[]> => {
    const plain = (text: string, color?: Line["color"]): Line[] => [
      { text: clean(text), size: 9, font: regular, color },
    ]
    const tenantLines: Line[] = [{ text: clean(row.tenantName || "-"), size: 9, font: regular }]
    if (detail === "full") {
      tenantLines.push({
        text: clean(row.tenantEmail || "sin correo"),
        size: 8,
        font: regular,
        color: gray,
      })
    }
    return {
      tenant: tenantLines,
      payer: plain(row.payerName || "sin acudiente"),
      document: plain(row.payerDocument || "sin documento"),
      month: plain(`${MONTH_LABELS[row.month] ?? row.month} ${row.year}`),
      createdAt: plain(formatBogotaDate(row.createdAt) || "-"),
      state: plain(stateLabel(row.state)),
      amount: plain(formatCurrency(row.amount)),
    }
  }

  const drawRow = (cells: Record<Column["key"], Line[]>, y: number) => {
    let x = margin
    for (const column of columns) {
      const lines = cellLines(cells[column.key], column.width)
      let lineY = y
      for (const line of lines) {
        const width = line.font.widthOfTextAtSize(line.text, line.size)
        const textX = column.align === "right" ? x + column.width - cellPad - width : x + cellPad
        page.drawText(line.text, { x: textX, y: lineY, size: line.size, font: line.font, color: line.color })
        lineY -= lineHeight(line)
      }
      x += column.width
    }
  }

  const rowHeightFor = (cells: Record<Column["key"], Line[]>) => {
    const tallest = Math.max(
      ...columns.map((column) =>
        cellLines(cells[column.key], column.width).reduce((sum, line) => sum + lineHeight(line), 0)
      )
    )
    return tallest + cellPad * 2
  }

  const drawTableHeader = () => {
    const height = Math.max(...columns.map((column) => column.header.length)) * 12 + cellPad * 2
    page.drawRectangle({
      x: margin,
      y: cursorY - height + 12,
      width: contentWidth,
      height,
      color: rgb(0.93, 0.95, 0.98),
    })
    let x = margin
    for (const column of columns) {
      column.header.forEach((text, index) => {
        const width = bold.widthOfTextAtSize(text, 9)
        const textX = column.align === "right" ? x + column.width - cellPad - width : x + cellPad
        page.drawText(text, { x: textX, y: cursorY - cellPad - index * 12 + 6, size: 9, font: bold })
      })
      x += column.width
    }
    cursorY -= height - 8
  }

  drawPageHeader()
  cursorY -= headerHeight

  if (rows.length === 0) {
    page.drawText(clean(emptyMessage(state)), {
      x: margin,
      y: cursorY,
      size: 12,
      font: regular,
    })
  } else {
    let grandTotal = 0

    for (const monthGroup of grouped) {
      const monthLabel = `${MONTH_LABELS[monthGroup.month] ?? monthGroup.month} ${monthGroup.year}`
      const isCurrentMonth = monthGroup.year === cutoff.year && monthGroup.month === cutoff.month
      ensureRoom(36 + 60 + 3 * 28)

      page.drawText(isCurrentMonth ? `${monthLabel}  (Este mes)` : monthLabel, {
        x: margin,
        y: cursorY,
        size: 14,
        font: bold,
        color: rgb(0.08, 0.08, 0.08),
      })
      cursorY -= 28

      for (const house of monthGroup.houses) {
        const houseLabelText = house.houseName || "Sin casa"
        ensureRoom(60 + 2 * 28)

        page.drawText(`Casa: ${clean(houseLabelText)}`, {
          x: margin,
          y: cursorY,
          size: 12,
          font: bold,
          color: rgb(0.08, 0.08, 0.08),
        })
        cursorY -= 22
        drawTableHeader()
        inTable = true

        for (const row of house.payments) {
          grandTotal += row.amount
          const cells = cellsFor(row)
          const height = rowHeightFor(cells)
          ensureRoom(height + 40)
          // Start of text is one font size below the row top.
          drawRow(cells, cursorY - cellPad - 7)
          page.drawLine({
            start: { x: margin, y: cursorY - height + 4 },
            end: { x: pageWidth - margin, y: cursorY - height + 4 },
            thickness: 0.5,
            color: rgb(0.86, 0.86, 0.86),
          })
          cursorY -= height
        }

        inTable = false
        ensureRoom(40)
        page.drawText(`Total casa: ${formatCurrency(house.totalAmount)}`, {
          x: margin + contentWidth - 200,
          y: cursorY - 8,
          size: 10,
          font: bold,
        })
        cursorY -= 36
      }

      ensureRoom(36)
      page.drawText(`Total del mes: ${formatCurrency(monthGroup.totalAmount)}`, {
        x: margin,
        y: cursorY,
        size: 11,
        font: bold,
      })
      cursorY -= 36
    }

    ensureRoom(24)
    page.drawText(`Total general: ${formatCurrency(grandTotal)}`, {
      x: margin,
      y: cursorY,
      size: 12,
      font: bold,
      color: rgb(0.1, 0.1, 0.1),
    })
  }

  const bytes = await pdf.save()
  const kind = reportKind(state)
  const filenameParts = ["payments-report", kind]
  if (houseLabel !== "Todas") filenameParts.push(slugifyChunk(houseLabel))
  if (tenantLabel !== "Todos") filenameParts.push(slugifyChunk(tenantLabel))
  filenameParts.push(periodFilenameChunk(period))
  const filename = `${filenameParts.filter(Boolean).join("-")}.pdf`
  const subject = `Alteza House - ${title}`

  return {
    bytes,
    filename,
    filtersLabel,
    subject,
  }
}
