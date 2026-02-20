import { ObjectId } from "mongodb"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { getCollection } from "@/lib/mongodb"

type PaymentDoc = {
  _id: ObjectId
  tenantId: string
  tenantName: string
  houseName: string
  month: number
  year: number
  amount: number
  state: "pending" | "approved"
}

type HouseDoc = {
  _id: ObjectId
  name: string
}

type TenantDoc = {
  _id: ObjectId
  name: string
}

export type ReportFilters = {
  houseId?: string
  tenantId?: string
  year?: number
  month?: number
  state?: "pending" | "approved" | "all"
}

type PaymentsReportResult = {
  bytes: Uint8Array
  filename: string
  filtersLabel: string
  subject: string
}

export class PaymentsReportError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "PaymentsReportError"
    this.status = status
  }
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

export async function buildPaymentsReport(filters: ReportFilters): Promise<PaymentsReportResult> {
  const { houseId, tenantId, year, month, state = "approved" } = filters
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  let houseLabel = "Todas"
  let tenantLabel = "Todos"
  const stateLabel = state === "all" ? "Todos" : state === "approved" ? "Aprobado" : "Pendiente"

  const query: Record<string, unknown> = {}
  if (year !== undefined) query.year = year
  if (month !== undefined) query.month = month
  if (state !== "all") query.state = state
  if (state === "pending") {
    // Unpaid report is always bounded to current period (no future months).
    query.$expr = {
      $or: [
        { $lt: ["$year", currentYear] },
        {
          $and: [{ $eq: ["$year", currentYear] }, { $lte: ["$month", currentMonth] }],
        },
      ],
    }
  }

  if (houseId) {
    if (!ObjectId.isValid(houseId)) {
      throw new PaymentsReportError("Invalid house id", 400)
    }
    const housesCol = await getCollection<HouseDoc>("houses")
    const house = await housesCol.findOne({ _id: new ObjectId(houseId) })
    if (!house) {
      throw new PaymentsReportError("House not found", 404)
    }
    houseLabel = house.name
    query.houseName = house.name
  }

  if (tenantId) {
    if (!ObjectId.isValid(tenantId)) {
      throw new PaymentsReportError("Invalid tenant id", 400)
    }
    const tenantsCol = await getCollection<TenantDoc>("tenants")
    const tenant = await tenantsCol.findOne({ _id: new ObjectId(tenantId), isDeleted: { $ne: true } })
    if (!tenant) {
      throw new PaymentsReportError("Tenant not found", 404)
    }
    tenantLabel = tenant.name
    query.tenantId = tenantId
  }

  const paymentsCol = await getCollection<PaymentDoc>("payments")
  const payments = await paymentsCol
    .find(query)
    .sort({ houseName: 1, year: 1, month: 1, tenantName: 1 })
    .toArray()

  const grouped = new Map<
    string,
    Map<string, { tenantName: string; year: number; month: number; state: "pending" | "approved"; total: number }>
  >()

  for (const payment of payments) {
    const houseKey = payment.houseName || "Sin casa"
    const aggregateKey = `${payment.tenantId}|${payment.year}|${payment.month}|${payment.state}`
    const houseMap =
      grouped.get(houseKey) ??
      new Map<
        string,
        { tenantName: string; year: number; month: number; state: "pending" | "approved"; total: number }
      >()
    const current = houseMap.get(aggregateKey)

    if (current) {
      current.total += Number(payment.amount || 0)
    } else {
      houseMap.set(aggregateKey, {
        tenantName: payment.tenantName || "-",
        year: payment.year,
        month: payment.month,
        state: payment.state,
        total: Number(payment.amount || 0),
      })
    }

    grouped.set(houseKey, houseMap)
  }

  const pdf = await PDFDocument.create()
  const pageWidth = 842
  const pageHeight = 595
  const margin = 40
  const rowHeight = 20

  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  let page = pdf.addPage([pageWidth, pageHeight])
  let cursorY = pageHeight - margin

  const filtersLabel = [
    `Casa: ${houseLabel}`,
    `Inquilino: ${tenantLabel}`,
    `Ano: ${year ?? "Todos"}`,
    `Mes: ${month ? MONTH_LABELS[month] : "Todos"}`,
    `Estado: ${stateLabel}`,
    state === "pending" ? `Corte: hasta ${MONTH_LABELS[currentMonth]} ${currentYear}` : undefined,
  ]
    .filter(Boolean)
    .join(" | ")

  const drawPageHeader = () => {
    page.drawText("Reporte de pagos", {
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

  if (payments.length === 0) {
    page.drawText("No se encontraron pagos con los filtros seleccionados.", {
      x: margin,
      y: cursorY,
      size: 12,
      font: regular,
    })
  } else {
    let grandTotal = 0

    for (const [houseName, houseRowsMap] of grouped) {
      const rows = Array.from(houseRowsMap.values()).sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year
        if (a.month !== b.month) return a.month - b.month
        return a.tenantName.localeCompare(b.tenantName, "es")
      })

      const sectionHeight = 60 + (rows.length + 2) * rowHeight
      ensureRoom(sectionHeight)

      page.drawText(`Casa: ${houseName}`, {
        x: margin,
        y: cursorY,
        size: 13,
        font: bold,
        color: rgb(0.08, 0.08, 0.08),
      })
      cursorY -= 24

      const colX = {
        tenant: margin,
        year: margin + 330,
        month: margin + 420,
        status: margin + 510,
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
      page.drawText("Ano", { x: colX.year, y: cursorY, size: 10, font: bold })
      page.drawText("Mes", { x: colX.month, y: cursorY, size: 10, font: bold })
      page.drawText("Estado", { x: colX.status, y: cursorY, size: 10, font: bold })
      page.drawText("Valor pagado", { x: colX.value, y: cursorY, size: 10, font: bold })
      cursorY -= rowHeight

      let houseTotal = 0

      for (const row of rows) {
        ensureRoom(rowHeight + 20)
        houseTotal += row.total
        grandTotal += row.total

        page.drawText(row.tenantName, { x: colX.tenant, y: cursorY, size: 10, font: regular })
        page.drawText(String(row.year), { x: colX.year, y: cursorY, size: 10, font: regular })
        page.drawText(MONTH_LABELS[row.month] ?? String(row.month), {
          x: colX.month,
          y: cursorY,
          size: 10,
          font: regular,
        })
        page.drawText(row.state === "approved" ? "Aprobado" : "Pendiente", {
          x: colX.status,
          y: cursorY,
          size: 10,
          font: regular,
        })
        page.drawText(formatCurrency(row.total), {
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

      ensureRoom(rowHeight + 12)
      page.drawText(`Total casa: ${formatCurrency(houseTotal)}`, {
        x: colX.value - 120,
        y: cursorY,
        size: 10,
        font: bold,
      })
      cursorY -= rowHeight + 12
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
  const reportKind = state === "approved" ? "paid" : state === "pending" ? "unpaid" : "all"
  const filenameParts = ["payments-report", reportKind]
  if (houseLabel !== "Todas") filenameParts.push(slugifyChunk(houseLabel))
  if (tenantLabel !== "Todos") filenameParts.push(slugifyChunk(tenantLabel))
  if (year) filenameParts.push(String(year))
  if (month) filenameParts.push(`m${month}`)
  const filename = `${filenameParts.filter(Boolean).join("-")}.pdf`
  const subject = `Alteza House - Reporte de pagos ${stateLabel.toLowerCase()}`

  return {
    bytes,
    filename,
    filtersLabel,
    subject,
  }
}
