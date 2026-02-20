import { NextRequest, NextResponse } from "next/server"
import { getAppSettings } from "@/lib/app-settings"
import { buildPaymentsReport } from "@/lib/payments-report"
import { sendPaymentsReportEmail } from "@/lib/resend"

function getBogotaDateParts(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  const parts = formatter.formatToParts(now)
  const get = (type: "year" | "month" | "day") =>
    Number(parts.find((p) => p.type === type)?.value ?? 0)
  const year = get("year")
  const month = get("month")
  const day = get("day")
  return { year, month, day }
}

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return { ok: false as const, response: NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 }) }
  }

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
  const headerSecret = req.headers.get("x-cron-secret")?.trim()
  const provided = bearer || headerSecret

  if (!provided || provided !== secret) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  return { ok: true as const }
}

export async function GET(req: NextRequest) {
  const auth = isAuthorized(req)
  if (!auth.ok) return auth.response

  const settings = await getAppSettings()
  if (!settings.enableNotifications) {
    return NextResponse.json({ ok: true, skipped: true, reason: "notifications_disabled" })
  }

  const { year, month, day } = getBogotaDateParts()
  const expectedDay = settings.paymentDueDate + 1
  if (day !== expectedDay) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "not_due_day_plus_one",
      today: day,
      expectedDay,
    })
  }

  const recipients = settings.notificationEmails.length
    ? settings.notificationEmails
    : settings.adminEmails

  if (!recipients.length) {
    return NextResponse.json({ ok: true, skipped: true, reason: "no_notification_recipients" })
  }

  try {
    const paidReport = await buildPaymentsReport({ state: "approved", year, month })
    const unpaidReport = await buildPaymentsReport({ state: "pending", year, month })
    const from = process.env.RESEND_FROM_EMAIL?.trim() || "onboarding@resend.dev"

    await Promise.all([
      sendPaymentsReportEmail({
        to: recipients,
        from,
        subject: paidReport.subject,
        filename: paidReport.filename,
        pdfBytes: paidReport.bytes,
        filtersLabel: paidReport.filtersLabel,
      }),
      sendPaymentsReportEmail({
        to: recipients,
        from,
        subject: unpaidReport.subject,
        filename: unpaidReport.filename,
        pdfBytes: unpaidReport.bytes,
        filtersLabel: unpaidReport.filtersLabel,
      }),
    ])
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate or send reports"
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    sent: true,
    month,
    year,
    reports: ["paid", "unpaid"],
    recipients: recipients.length,
  })
}
