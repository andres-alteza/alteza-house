import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { groupPaymentsByMonthAndHouse } from "./group-payments"
import type { PaymentReportRow, ReportFilters } from "./payment-report-rows"

export type PaymentsReportPdfResult = {
  bytes: Uint8Array
  filename: string
  filtersLabel: string
  subject: string
}

const MONTH_LABELS = [
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

function truncateText(value: string, maxChars: number) {
  if (value.length <= maxChars) return value
  return `${value.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`
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
  if (state === "approved") return "Inquilinos al dia"
  if (state === "pending") return "Inquilinos con meses impagos"
  return "Reporte de pagos"
}

function emptyMessage(state: ReportFilters["state"]) {
  if (state === "approved") return "No hay inquilinos al dia para el periodo seleccionado."
  if (state === "pending") return "No hay meses impagos para los filtros seleccionados."
  return "No se encontraron pagos con los filtros seleccionados."
}

export async function renderPaymentsReportPdf({
  rows,
  state = "approved",
  houseLabel,
  tenantLabel,
  year,
  month,
  cutoff,
}: {
  rows: PaymentReportRow[]
  state?: ReportFilters["state"]
  houseLabel: string
  tenantLabel: string
  year?: number
  month?: number
  cutoff: { year: number; month: number }
}): Promise<PaymentsReportPdfResult> {
  const grouped = groupPaymentsByMonthAndHouse(rows)
  const pdf = await PDFDocument.create()
  const pageWidth = 842
  const pageHeight = 595
  const margin = 40
  const rowHeight = 20

  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  let page = pdf.addPage([pageWidth, pageHeight])
  let cursorY = pageHeight - margin
  const stateLabelText = state === "all" ? "Todos" : state === "approved" ? "Al dia" : "Impago"

  const filtersLabel = [
    `Casa: ${houseLabel}`,
    `Inquilino: ${tenantLabel}`,
    `Ano: ${year ?? "Todos"}`,
    `Mes: ${month ? MONTH_LABELS[month] : "Todos"}`,
    `Estado: ${stateLabelText}`,
    state === "pending" ? `Corte: hasta ${MONTH_LABELS[cutoff.month]} ${cutoff.year}` : undefined,
  ]
    .filter(Boolean)
    .join(" | ")

  const title = reportTitle(state)

  const drawPageHeader = () => {
    page.drawText(title, {
      x: margin,
      y: pageHeight - margin,
      size: 18,
      font: bold,
      color: rgb(0.12, 0.12, 0.12),
    })

    page.drawText(filtersLabel, {
      x: margin,
      y: pageHeight - margin - 22,
      size: 10,
      font: regular,
      color: rgb(0.3, 0.3, 0.3),
    })

    page.drawText(`Generado: ${new Date().toLocaleString("es-CO")}`, {
      x: margin,
      y: pageHeight - margin - 38,
      size: 10,
      font: regular,
      color: rgb(0.35, 0.35, 0.35),
    })
  }

  const ensureRoom = (needed: number) => {
    if (cursorY - needed < margin) {
      page = pdf.addPage([pageWidth, pageHeight])
      cursorY = pageHeight - margin
      drawPageHeader()
      cursorY -= 60
    }
  }

  drawPageHeader()
  cursorY -= 70

  if (rows.length === 0) {
    page.drawText(emptyMessage(state), {
      x: margin,
      y: cursorY,
      size: 12,
      font: regular,
    })
  } else {
    let grandTotal = 0
    const amountHeader = state === "pending" ? "Valor pendiente" : "Valor pagado"

    for (const monthGroup of grouped) {
      const monthLabel = `${MONTH_LABELS[monthGroup.month] ?? monthGroup.month} ${monthGroup.year}`
      const isCurrentMonth = monthGroup.year === cutoff.year && monthGroup.month === cutoff.month
      const firstHouseRows = monthGroup.houses[0]?.payments.length ?? 0
      ensureRoom(36 + 60 + (firstHouseRows + 2) * rowHeight)

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
        ensureRoom(60 + (house.payments.length + 2) * rowHeight)

        page.drawText(`Casa: ${houseLabelText}`, {
          x: margin,
          y: cursorY,
          size: 12,
          font: bold,
          color: rgb(0.08, 0.08, 0.08),
        })
        cursorY -= 22

        const colX = {
          tenant: margin,
          status: margin + 360,
          value: margin + 610,
        }

        page.drawRectangle({
          x: margin,
          y: cursorY - 4,
          width: pageWidth - margin * 2,
          height: rowHeight,
          color: rgb(0.93, 0.95, 0.98),
        })
        page.drawText("Inquilino", { x: colX.tenant, y: cursorY, size: 10, font: bold })
        page.drawText("Estado", { x: colX.status, y: cursorY, size: 10, font: bold })
        page.drawText(amountHeader, { x: colX.value, y: cursorY, size: 10, font: bold })
        cursorY -= rowHeight

        for (const row of house.payments) {
          ensureRoom(rowHeight + 20)
          grandTotal += row.amount

          page.drawText(truncateText(row.tenantName, 48), {
            x: colX.tenant,
            y: cursorY,
            size: 10,
            font: regular,
          })
          page.drawText(stateLabel(row.state), {
            x: colX.status,
            y: cursorY,
            size: 10,
            font: regular,
          })
          page.drawText(formatCurrency(row.amount), {
            x: colX.value,
            y: cursorY,
            size: 10,
            font: regular,
          })

          page.drawLine({
            start: { x: margin, y: cursorY - 5 },
            end: { x: pageWidth - margin, y: cursorY - 5 },
            thickness: 0.5,
            color: rgb(0.86, 0.86, 0.86),
          })
          cursorY -= rowHeight
        }

        ensureRoom(rowHeight + 8)
        page.drawText(`Total casa: ${formatCurrency(house.totalAmount)}`, {
          x: colX.value - 120,
          y: cursorY,
          size: 10,
          font: bold,
        })
        cursorY -= rowHeight + 8
      }

      ensureRoom(rowHeight + 16)
      page.drawText(`Total del mes: ${formatCurrency(monthGroup.totalAmount)}`, {
        x: margin,
        y: cursorY,
        size: 11,
        font: bold,
      })
      cursorY -= rowHeight + 16
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
  if (year) filenameParts.push(String(year))
  if (month) filenameParts.push(`m${month}`)
  const filename = `${filenameParts.filter(Boolean).join("-")}.pdf`
  const subject = `Alteza House - ${title}`

  return {
    bytes,
    filename,
    filtersLabel,
    subject,
  }
}
