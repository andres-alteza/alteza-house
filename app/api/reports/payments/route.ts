import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-auth"
import { parseJson, parseQuery } from "@/lib/api-helpers"
import { buildPaymentsReport, PaymentsReportError } from "@/lib/payments-report"
import { sendPaymentsReportEmail } from "@/lib/resend"

const parseOptionalInt = (label: string, min: number, max: number) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === null || value === "") return undefined
      if (typeof value === "number") return value
      if (typeof value === "string") return Number.parseInt(value.trim(), 10)
      return value
    },
    z.number().int(`Invalid ${label}`).min(min, `Invalid ${label}`).max(max, `Invalid ${label}`).optional()
  )

const reportFiltersSchema = z.object({
  houseId: z.string().trim().optional(),
  tenantId: z.string().trim().optional(),
  year: parseOptionalInt("year", 2000, 3000),
  month: parseOptionalInt("month", 1, 12),
  state: z.enum(["pending", "approved", "all"]).optional(),
})

const sendReportSchema = reportFiltersSchema.extend({
  emails: z.array(z.string().trim().email("Invalid email")).min(1, "At least one email is required"),
})

function toErrorResponse(error: unknown) {
  if (error instanceof PaymentsReportError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  const message = error instanceof Error ? error.message : "Failed to generate report"
  return NextResponse.json({ error: message }, { status: 500 })
}

export const GET = withAuth(
  async (req: NextRequest) => {
    const parsedQuery = parseQuery(req, reportFiltersSchema)
    if ("error" in parsedQuery) return parsedQuery.error

    let report
    try {
      report = await buildPaymentsReport(parsedQuery.data)
    } catch (error) {
      return toErrorResponse(error)
    }

    return new NextResponse(Buffer.from(report.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${report.filename}"`,
        "Cache-Control": "no-store",
      },
    })
  },
  { adminOnly: true }
)

export const POST = withAuth(
  async (req: NextRequest) => {
    const parsedBody = await parseJson(req, sendReportSchema)
    if ("error" in parsedBody) return parsedBody.error

    let report
    try {
      report = await buildPaymentsReport(parsedBody.data)
    } catch (error) {
      return toErrorResponse(error)
    }

    try {
      const from = process.env.RESEND_FROM_EMAIL?.trim() || "onboarding@resend.dev"
      await sendPaymentsReportEmail({
        to: parsedBody.data.emails,
        from,
        subject: report.subject,
        filename: report.filename,
        pdfBytes: report.bytes,
        filtersLabel: report.filtersLabel,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send email"
      return NextResponse.json({ error: message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, sent: true })
  },
  { adminOnly: true }
)
