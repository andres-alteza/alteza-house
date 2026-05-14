import { NextRequest, NextResponse } from "next/server"
import { getAppSettings } from "@/lib/app-settings"
import { getCollection } from "@/lib/mongodb"
import { buildOverduePaymentReminders, type OverduePaymentReminder } from "@/lib/payment-reminders"
import { buildPaymentsReport } from "@/lib/payments-report"
import { sendPaymentsReportEmail } from "@/lib/resend"
import {
  formatCurrencyForWhatsApp,
  getTwilioWhatsAppConfig,
  normalizeWhatsAppPhone,
  sendWhatsAppTemplate,
  type TwilioWhatsAppConfig,
} from "@/lib/twilio-whatsapp"

type WhatsAppReminderLogDoc = {
  key: string
  tenantId: string
  contractId: string
  tenantName: string
  year: number
  month: number
  reminderDate: string
  recipientRole: "tenant" | "guardian"
  recipientName: string
  recipientPhone: string
  templateSid: string
  status: "sending" | "sent" | "failed"
  attempts: number
  twilioMessageSid?: string
  twilioStatus?: string
  error?: string
  createdAt: Date
  updatedAt: Date
}

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
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  return { year, month, day, date }
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

async function sendWhatsAppPaymentReminders({
  reminders,
  config,
  reminderDate,
}: {
  reminders: OverduePaymentReminder[]
  config: TwilioWhatsAppConfig
  reminderDate: string
}) {
  const logsCol = await getCollection<WhatsAppReminderLogDoc>("whatsappNotificationLogs")
  const summary = {
    targets: reminders.length,
    attempted: 0,
    sent: 0,
    skippedDuplicate: 0,
    skippedInvalidPhone: 0,
    failed: 0,
    errors: [] as string[],
  }

  for (const reminder of reminders) {
    const phonesSeenForTenant = new Set<string>()

    for (const recipient of reminder.recipients) {
      const normalizedPhone = normalizeWhatsAppPhone(recipient.phone)
      if (!normalizedPhone || phonesSeenForTenant.has(normalizedPhone)) {
        summary.skippedInvalidPhone += normalizedPhone ? 0 : 1
        continue
      }
      phonesSeenForTenant.add(normalizedPhone)

      const key = [
        config.contentSid,
        reminderDate,
        reminder.year,
        reminder.month,
        reminder.tenantId,
        reminder.contractId,
        normalizedPhone,
      ].join(":")
      const existingSent = await logsCol.findOne({ key, status: "sent" })
      if (existingSent) {
        summary.skippedDuplicate += 1
        continue
      }

      summary.attempted += 1
      const now = new Date()
      await logsCol.updateOne(
        { key },
        {
          $set: {
            tenantId: reminder.tenantId,
            contractId: reminder.contractId,
            tenantName: reminder.tenantName,
            year: reminder.year,
            month: reminder.month,
            reminderDate,
            recipientRole: recipient.role,
            recipientName: recipient.name,
            recipientPhone: normalizedPhone,
            templateSid: config.contentSid,
            status: "sending",
            updatedAt: now,
          },
          $setOnInsert: { key, createdAt: now },
          $inc: { attempts: 1 },
          $unset: { error: "" },
        },
        { upsert: true }
      )

      try {
        const result = await sendWhatsAppTemplate(config, {
          to: normalizedPhone,
          variables: {
            "1": reminder.tenantName,
            "2": reminder.dueDateLabel,
            "3": formatCurrencyForWhatsApp(reminder.pendingAmount),
          },
        })

        await logsCol.updateOne(
          { key },
          {
            $set: {
              status: "sent",
              twilioMessageSid: result.sid,
              twilioStatus: result.status,
              updatedAt: new Date(),
            },
          }
        )
        summary.sent += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to send WhatsApp reminder"
        await logsCol.updateOne(
          { key },
          {
            $set: {
              status: "failed",
              error: message,
              updatedAt: new Date(),
            },
          }
        )
        summary.failed += 1
        summary.errors.push(`${reminder.tenantName} (${recipient.role}): ${message}`)
      }
    }
  }

  return summary
}

export async function GET(req: NextRequest) {
  const auth = isAuthorized(req)
  if (!auth.ok) return auth.response

  const settings = await getAppSettings()
  if (!settings.enableNotifications) {
    return NextResponse.json({ ok: true, skipped: true, reason: "notifications_disabled" })
  }

  const { year, month, day, date } = getBogotaDateParts()
  const reportDay = settings.paymentDueDate + 1
  const shouldSendReports = day === reportDay
  const shouldSendWhatsAppReminders = day > settings.paymentDueDate

  if (!shouldSendReports && !shouldSendWhatsAppReminders) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "before_payment_due_day",
      today: day,
      paymentDueDate: settings.paymentDueDate,
    })
  }

  const emailRecipients = settings.notificationEmails.length
    ? settings.notificationEmails
    : settings.adminEmails

  const overdueReminders = shouldSendWhatsAppReminders
    ? await buildOverduePaymentReminders({
        year,
        month,
        paymentDueDate: settings.paymentDueDate,
      })
    : []
  let whatsappConfig: TwilioWhatsAppConfig | null = null
  if (overdueReminders.length) {
    try {
      whatsappConfig = getTwilioWhatsAppConfig()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid Twilio WhatsApp configuration"
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  if (!shouldSendReports && !overdueReminders.length) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "no_overdue_tenants",
      month,
      year,
      reminderDate: date,
    })
  }

  try {
    if (shouldSendReports && emailRecipients.length) {
      const paidReport = await buildPaymentsReport({ state: "approved", year, month })
      const unpaidReport = await buildPaymentsReport({ state: "pending", year, month })
      const from = process.env.RESEND_FROM_EMAIL?.trim() || "onboarding@resend.dev"

      await Promise.all([
        sendPaymentsReportEmail({
          to: emailRecipients,
          from,
          subject: paidReport.subject,
          filename: paidReport.filename,
          pdfBytes: paidReport.bytes,
          filtersLabel: paidReport.filtersLabel,
        }),
        sendPaymentsReportEmail({
          to: emailRecipients,
          from,
          subject: unpaidReport.subject,
          filename: unpaidReport.filename,
          pdfBytes: unpaidReport.bytes,
          filtersLabel: unpaidReport.filtersLabel,
        }),
      ])
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate or send reports"
    return NextResponse.json({ error: message }, { status: 500 })
  }

  let whatsappSummary = {
    targets: overdueReminders.length,
    attempted: 0,
    sent: 0,
    skippedDuplicate: 0,
    skippedInvalidPhone: 0,
    failed: 0,
    errors: [] as string[],
  }

  if (whatsappConfig) {
    whatsappSummary = await sendWhatsAppPaymentReminders({
      reminders: overdueReminders,
      config: whatsappConfig,
      reminderDate: date,
    })
  }

  if (whatsappSummary.failed > 0) {
    return NextResponse.json(
      {
        ok: false,
        sent: true,
        month,
        year,
        reminderDate: date,
        reports: shouldSendReports && emailRecipients.length ? ["paid", "unpaid"] : [],
        emailRecipients: emailRecipients.length,
        whatsapp: whatsappSummary,
      },
      { status: 502 }
    )
  }

  return NextResponse.json({
    ok: true,
    sent: true,
    month,
    year,
    reminderDate: date,
    reports: shouldSendReports && emailRecipients.length ? ["paid", "unpaid"] : [],
    emailRecipients: emailRecipients.length,
    whatsapp: whatsappSummary,
  })
}
