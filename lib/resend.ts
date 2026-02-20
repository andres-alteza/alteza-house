import { Resend } from "resend"

let resendClient: Resend | null = null

function getResendClient() {
  if (resendClient) return resendClient
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set")
  }
  resendClient = new Resend(apiKey)
  return resendClient
}

async function sendEmailOrThrow(
  resend: Resend,
  payload: Parameters<typeof resend.emails.send>[0]
) {
  const { error } = await resend.emails.send(payload)
  if (error) {
    throw new Error(error.message || "Failed to send email with Resend")
  }
}

type UnpaidTenantRow = {
  tenantName: string
  tenantEmail: string
  monthlyPrice: number
}

type HouseReport = {
  houseName: string
  tenants: UnpaidTenantRow[]
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value)
}

function buildHtmlReport({
  month,
  year,
  dueDate,
  houses,
}: {
  month: number
  year: number
  dueDate: number
  houses: HouseReport[]
}) {
  const monthLabel = new Intl.DateTimeFormat("es-CO", { month: "long" }).format(new Date(year, month - 1, 1))
  const housesHtml = houses
    .map((house) => {
      const tenantItems = house.tenants
        .map(
          (tenant) =>
            `<li><strong>${tenant.tenantName}</strong> (${tenant.tenantEmail}) - ${formatCurrency(tenant.monthlyPrice)}</li>`
        )
        .join("")
      return `<h3 style="margin-bottom: 6px;">Casa ${house.houseName}</h3><ul style="margin-top: 0;">${tenantItems}</ul>`
    })
    .join("")

  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <h2 style="margin-bottom: 8px;">Reporte mensual de pagos pendientes</h2>
      <p style="margin-top: 0;">
        Fecha de corte: día ${dueDate + 1}.<br/>
        Periodo: ${monthLabel} ${year}.
      </p>
      ${housesHtml}
    </div>
  `
}

function buildTextReport({
  month,
  year,
  dueDate,
  houses,
}: {
  month: number
  year: number
  dueDate: number
  houses: HouseReport[]
}) {
  const monthLabel = new Intl.DateTimeFormat("es-CO", { month: "long" }).format(new Date(year, month - 1, 1))
  const lines = [
    "Reporte mensual de pagos pendientes",
    `Fecha de corte: dia ${dueDate + 1}`,
    `Periodo: ${monthLabel} ${year}`,
    "",
  ]

  for (const house of houses) {
    lines.push(`Casa ${house.houseName}:`)
    for (const tenant of house.tenants) {
      lines.push(`- ${tenant.tenantName} (${tenant.tenantEmail}) - ${formatCurrency(tenant.monthlyPrice)}`)
    }
    lines.push("")
  }

  return lines.join("\n")
}

export async function sendMonthlyUnpaidReportEmail({
  to,
  from,
  month,
  year,
  dueDate,
  houses,
}: {
  to: string[]
  from: string
  month: number
  year: number
  dueDate: number
  houses: HouseReport[]
}) {
  const resend = getResendClient()
  const monthLabel = new Intl.DateTimeFormat("es-CO", { month: "long" }).format(new Date(year, month - 1, 1))

  await sendEmailOrThrow(resend, {
    from,
    to,
    subject: `Alteza House - Pendientes de pago ${monthLabel} ${year}`,
    html: buildHtmlReport({ month, year, dueDate, houses }),
    text: buildTextReport({ month, year, dueDate, houses }),
  })
}

export async function sendPaymentsReportEmail({
  to,
  from,
  subject,
  filename,
  pdfBytes,
  filtersLabel,
}: {
  to: string[]
  from: string
  subject: string
  filename: string
  pdfBytes: Uint8Array
  filtersLabel: string
}) {
  const resend = getResendClient()

  const text = [
    "Hola,",
    "",
    "Adjuntamos el reporte de pagos solicitado.",
    `Filtros: ${filtersLabel}`,
    "",
    "Enviado desde Alteza House.",
  ].join("\n")

  await sendEmailOrThrow(resend, {
    from,
    to,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
        <h2 style="margin-bottom: 8px;">Reporte de pagos</h2>
        <p style="margin-top: 0;">Adjuntamos el reporte de pagos solicitado.</p>
        <p><strong>Filtros:</strong> ${filtersLabel}</p>
      </div>
    `,
    text,
    attachments: [
      {
        filename,
        content: Buffer.from(pdfBytes),
        contentType: "application/pdf",
      },
    ],
  })
}
