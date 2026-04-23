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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function buildPasswordResetHtml({ email, link }: { email: string; link: string }) {
  const safeEmail = escapeHtml(email)
  const safeLink = escapeHtml(link)

  return `<!DOCTYPE html>
<html>
  <body style="margin:0; padding:0; background-color:#f3f4f6; font-family: Inter, Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding: 20px;">
      <tr>
        <td align="center">

          <!-- Card -->
          <table width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:12px; padding:32px; box-shadow:0 6px 20px rgba(0,0,0,0.06);">

            <!-- Header -->
            <tr>
              <td style="font-size:20px; font-weight:600; color:#111827; padding-bottom:8px;">
                Alteza House
              </td>
            </tr>

            <!-- Title -->
            <tr>
              <td style="font-size:18px; font-weight:600; color:#374151; padding-bottom:16px;">
                Configura tu contraseña
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="font-size:14px; color:#6b7280; line-height:1.6; padding-bottom:24px;">
                Recibimos una solicitud para configurar la contraseña de la cuenta asociada a <strong>${safeEmail}</strong>. Usa el siguiente enlace para continuar.
              </td>
            </tr>

            <!-- Button -->
            <tr>
              <td align="center" style="padding-bottom:24px;">
                <a href="${safeLink}"
                   style="background-color:#6D28D9; color:#ffffff; text-decoration:none; padding:12px 22px; border-radius:8px; font-size:14px; font-weight:500; display:inline-block;">
                  Configurar contraseña
                </a>
              </td>
            </tr>

            <!-- Secondary text -->
            <tr>
              <td style="font-size:13px; color:#6b7280; line-height:1.5; padding-bottom:16px;">
                Este enlace es seguro y te permitirá definir tu contraseña.
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="font-size:12px; color:#9ca3af; padding-top:16px; border-top:1px solid #e5e7eb;">
                Si no solicitaste esta acción, puedes ignorar este mensaje.<br><br>
                © Alteza House
              </td>
            </tr>

          </table>

        </td>
      </tr>
    </table>
  </body>
</html>`
}

function buildPasswordResetText({ email, link }: { email: string; link: string }) {
  return [
    "Alteza House",
    "Configura tu contraseña",
    "",
    `Recibimos una solicitud para configurar la contraseña de la cuenta asociada a ${email}. Usa el siguiente enlace para continuar:`,
    link,
    "",
    "Este enlace es seguro y te permitirá definir tu contraseña.",
    "",
    "Si no solicitaste esta acción, puedes ignorar este mensaje.",
    "© Alteza House",
  ].join("\n")
}

export async function sendPasswordResetEmail({
  to,
  link,
  from,
}: {
  to: string
  link: string
  from?: string
}) {
  const resend = getResendClient()
  const sender = from?.trim() || process.env.RESEND_FROM_EMAIL?.trim() || "onboarding@resend.dev"

  await sendEmailOrThrow(resend, {
    from: sender,
    to: [to],
    subject: "Alteza House — Configura tu contraseña",
    html: buildPasswordResetHtml({ email: to, link }),
    text: buildPasswordResetText({ email: to, link }),
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
