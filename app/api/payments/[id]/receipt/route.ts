import { NextRequest, NextResponse } from "next/server"
import { readFile } from "node:fs/promises"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { getCollection } from "@/lib/mongodb"
import { withAuth } from "@/lib/api-auth"
import { parseObjectIdParam } from "@/lib/mongo-helpers"
import { getAppSettings } from "@/lib/app-settings"

type PaymentDoc = {
  _id: import("mongodb").ObjectId
  tenantName: string
  tenantEmail: string
  houseName: string
  month: number
  year: number
  amount: number
  state: "pending" | "approved"
  createdAt: Date | string
  updatedAt?: Date | string
}

type TenantDoc = {
  _id: import("mongodb").ObjectId
  name: string
  email: string
  phone?: string
  houseName?: string
  parentName?: string
  parentId?: string
  parentAddress?: string
  parentPhone?: string
}

const LOGO_PATHS = [
  `${process.cwd()}/public/branding/logo.png`,
  "/Users/stianrincon/.cursor/projects/Users-stianrincon-Documents-alteza-house-software-alteza-house/assets/PHOTO-2026-02-12-19-14-38-59605c31-bb2b-471b-9f95-addaba09546d.png",
]

const SIGNATURE_PATHS = [
  `${process.cwd()}/public/branding/signature.png`,
  "/Users/stianrincon/.cursor/projects/Users-stianrincon-Documents-alteza-house-software-alteza-house/assets/signature-8dea2785-d7ad-4976-b97a-3dace66faba7.png",
]

const RECEIPT_BASE_WIDTH = 842
const RECEIPT_BASE_HEIGHT = 595
// Adjusted to be 3x larger than the previous compact version.
const RECEIPT_SCALE = 0.96

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

async function readFirstAvailableFile(paths: string[]) {
  for (const p of paths) {
    try {
      return await readFile(p)
    } catch {
      // Try next path
    }
  }
  return null
}

async function embedImageSafely(pdf: PDFDocument, bytes: Uint8Array) {
  try {
    return await pdf.embedPng(bytes)
  } catch {
    try {
      return await pdf.embedJpg(bytes)
    } catch {
      return null
    }
  }
}

function unitsToSpanish(n: number): string {
  const units = [
    "",
    "uno",
    "dos",
    "tres",
    "cuatro",
    "cinco",
    "seis",
    "siete",
    "ocho",
    "nueve",
  ]
  return units[n] ?? ""
}

function tensToSpanish(n: number): string {
  if (n < 10) return unitsToSpanish(n)
  if (n >= 10 && n <= 15) {
    return (
      {
        10: "diez",
        11: "once",
        12: "doce",
        13: "trece",
        14: "catorce",
        15: "quince",
      }[n] ?? ""
    )
  }
  if (n < 20) return `dieci${unitsToSpanish(n - 10)}`
  if (n === 20) return "veinte"
  if (n < 30) return `veinti${unitsToSpanish(n - 20)}`

  const tens = [
    "",
    "",
    "",
    "treinta",
    "cuarenta",
    "cincuenta",
    "sesenta",
    "setenta",
    "ochenta",
    "noventa",
  ]
  const ten = Math.floor(n / 10)
  const unit = n % 10
  return unit === 0 ? tens[ten] : `${tens[ten]} y ${unitsToSpanish(unit)}`
}

function hundredsToSpanish(n: number): string {
  if (n < 100) return tensToSpanish(n)
  if (n === 100) return "cien"
  const hundreds = [
    "",
    "ciento",
    "doscientos",
    "trescientos",
    "cuatrocientos",
    "quinientos",
    "seiscientos",
    "setecientos",
    "ochocientos",
    "novecientos",
  ]
  const hundred = Math.floor(n / 100)
  const rest = n % 100
  return rest === 0 ? hundreds[hundred] : `${hundreds[hundred]} ${tensToSpanish(rest)}`
}

function numberToSpanishWords(value: number): string {
  const n = Math.floor(Math.max(0, value))
  if (n === 0) return "cero"

  const millions = Math.floor(n / 1_000_000)
  const thousands = Math.floor((n % 1_000_000) / 1000)
  const hundreds = n % 1000

  const parts: string[] = []
  if (millions > 0) {
    if (millions === 1) parts.push("un millon")
    else parts.push(`${hundredsToSpanish(millions)} millones`)
  }
  if (thousands > 0) {
    if (thousands === 1) parts.push("mil")
    else parts.push(`${hundredsToSpanish(thousands)} mil`)
  }
  if (hundreds > 0) parts.push(hundredsToSpanish(hundreds))
  return parts.join(" ")
}

export const GET = withAuth(async (req: NextRequest, user, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const idParsed = parseObjectIdParam(id)
  if ("error" in idParsed) return idParsed.error

  const col = await getCollection<PaymentDoc>("payments")
  const payment = await col.findOne({ _id: idParsed.value })
  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 })
  }

  const isOwner = payment.tenantEmail.toLowerCase() === user.email.toLowerCase()
  if (user.role !== "admin" && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (payment.state !== "approved") {
    return NextResponse.json({ error: "Receipt is only available for approved payments" }, { status: 400 })
  }

  const createdAt = new Date(payment.createdAt)
  const approvedAt = payment.updatedAt ? new Date(payment.updatedAt) : new Date()
  const monthLabel = new Date(payment.year, Math.max(0, payment.month - 1), 1).toLocaleDateString("es-CO", {
    month: "long",
  })
  const amountNumber = Number(payment.amount || 0)
  const amountLabel = amountNumber.toLocaleString("es-CO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  const tenantCol = await getCollection<TenantDoc>("tenants")
  const tenant = await tenantCol.findOne({
    email: new RegExp(`^${escapeRegex(payment.tenantEmail)}$`, "i"),
  })

  const tenantDisplayName = tenant?.name || payment.tenantName
  const concept = `Pago del arriendo del mes de ${monthLabel} del año ${payment.year}`
  const amountInWords = `${numberToSpanishWords(amountNumber)} pesos`
  const appSettings = await getAppSettings()

  const pdf = await PDFDocument.create()
  const page = pdf.addPage([RECEIPT_BASE_WIDTH, RECEIPT_BASE_HEIGHT]) // Base layout, scaled down at the end.
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const titleColor = rgb(0.68, 0.1, 0.55)

  page.drawRectangle({
    x: 12,
    y: 12,
    width: 818,
    height: 571,
    borderWidth: 1,
    borderColor: rgb(0.78, 0.78, 0.78),
  })

  const yTop = 535
  page.drawText("RECIBO DE PAGO", {
    x: 30,
    y: yTop,
    size: 36,
    font: bold,
    color: titleColor,
  })

  page.drawText("Fecha :", { x: 520, y: yTop + 3, size: 16, font: bold })
  const dateLabel = approvedAt.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  })
  page.drawText(dateLabel, { x: 620, y: yTop + 3, size: 16, font })
  page.drawLine({
    start: { x: 520, y: yTop - 10 },
    end: { x: 790, y: yTop - 10 },
    thickness: 1,
    color: rgb(0.2, 0.2, 0.2),
  })

  const leftX = 30
  const valueX = 135
  let lineY = 450
  const rowGap = 60

  const drawRow = (label: string, value: string, lineWidth = 410) => {
    page.drawText(label, { x: leftX, y: lineY, size: 16, font: bold })
    page.drawText(value, { x: valueX, y: lineY, size: 16, font })
    page.drawLine({
      start: { x: valueX, y: lineY - 6 },
      end: { x: valueX + lineWidth, y: lineY - 6 },
      thickness: 1,
      color: rgb(0.2, 0.2, 0.2),
    })
    lineY -= rowGap
  }

  drawRow("Recibi de:", tenantDisplayName, 455)
  drawRow("Cantidad:", amountInWords, 455)
  drawRow("Concepto:", concept, 455)

  const amountBoxX = 680
  const amountBoxY = 390
  const amountBoxWidth = 130
  const amountBoxHeight = 50
  const amountCurrencyX = amountBoxX + 10
  const amountValueSize = 15
  const currencySymbol = "$"
  const currencyWidth = bold.widthOfTextAtSize(currencySymbol, 20)
  const amountGap = 4
  const amountValueX = amountCurrencyX + currencyWidth + amountGap

  page.drawText("Cantidad:", { x: amountBoxX, y: 450, size: 16, font: bold })
  page.drawRectangle({
    x: amountBoxX,
    y: amountBoxY,
    width: amountBoxWidth,
    height: amountBoxHeight,
    borderWidth: 1,
    borderColor: rgb(0.1, 0.1, 0.1),
  })
  page.drawText(currencySymbol, { x: amountCurrencyX, y: 410, size: 20, font: bold })
  page.drawText(amountLabel, { x: amountValueX, y: 410, size: amountValueSize, font: bold })

  page.drawText("Recibido por:", { x: 30, y: 260, size: 16, font: bold })
  page.drawLine({
    start: { x: 160, y: 254 },
    end: { x: 460, y: 254 },
    thickness: 1,
    color: rgb(0.2, 0.2, 0.2),
  })

  const signatureBytes = await readFirstAvailableFile(SIGNATURE_PATHS)
  if (signatureBytes) {
    const signatureImage = await embedImageSafely(pdf, signatureBytes)
    if (signatureImage) {
      page.drawImage(signatureImage, {
        x: 195,
        y: 248,
        width: 125,
        height: 45,
      })
    }
  }

  const issuerName = appSettings.legalRepresentativeName
  const issuerCompany = appSettings.legalRepresentativeRole
  const issuerAddress = appSettings.legalRepresentativeAddress
  const issuerPhone = appSettings.legalRepresentativePhone

  page.drawText(issuerName, { x: 160, y: 225, size: 14, font })
  page.drawText(issuerCompany, { x: 160, y: 202, size: 14, font })
  page.drawText(issuerAddress, { x: 160, y: 179, size: 14, font })
  page.drawText(issuerPhone, { x: 160, y: 156, size: 14, font })

  const logoBytes = await readFirstAvailableFile(LOGO_PATHS)
  if (logoBytes) {
    const logo = await embedImageSafely(pdf, logoBytes)
    if (logo) {
      page.drawImage(logo, {
        x: 625,
        y: 90,
        width: 170,
        height: 170,
      })
    }
  }

  page.drawText(`ID recibo: ${payment._id.toString()}`, { x: 28, y: 42, size: 10, font })
  page.drawText(`Pago enviado: ${createdAt.toLocaleString("es-CO")}`, { x: 260, y: 42, size: 10, font })
  page.drawText(`Aprobado: ${approvedAt.toLocaleString("es-CO")}`, { x: 520, y: 42, size: 10, font })

  page.scaleContent(RECEIPT_SCALE, RECEIPT_SCALE)
  page.setSize(RECEIPT_BASE_WIDTH * RECEIPT_SCALE, RECEIPT_BASE_HEIGHT * RECEIPT_SCALE)

  const bytes = await pdf.save()

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="receipt-${payment.year}-${payment.month}-${payment._id.toString()}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
})
