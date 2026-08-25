import assert from "node:assert/strict"
import { test } from "node:test"
import { PDFDocument } from "pdf-lib"
import {
  buildPaidReportRows,
  buildUnpaidReportRows,
  type ReportRowSources,
} from "./payment-report-rows.ts"
import { renderPaymentsReportPdf } from "./payments-report-pdf.ts"

function sources(): ReportRowSources {
  return {
    houses: [
      { id: "house-cedar", name: "Cedar House" },
      { id: "house-birch", name: "Birch House" },
    ],
    tenants: [
      { id: "tenant-ana", name: "Ana", houseId: "house-cedar", houseName: "Cedar House" },
      { id: "tenant-luis", name: "Luis", houseId: "house-birch", houseName: "Birch House" },
    ],
    contracts: [
      {
        id: "contract-ana",
        tenantId: "tenant-ana",
        tenantName: "Ana",
        startDate: "2026-07-01",
        endDate: "2026-12-31",
        monthlyPrice: 200,
        status: "approved",
      },
      {
        id: "contract-luis",
        tenantId: "tenant-luis",
        tenantName: "Luis",
        startDate: "2026-08-01",
        endDate: "2026-12-31",
        monthlyPrice: 300,
        status: "approved",
      },
    ],
    payments: [
      {
        id: "pay-ana-aug",
        tenantId: "tenant-ana",
        tenantName: "Ana",
        contractId: "contract-ana",
        houseName: "Cedar House",
        year: 2026,
        month: 8,
        amount: 200,
        state: "approved",
      },
    ],
  }
}

test("renders a paid PDF grouped by the selected month and house", async () => {
  const report = await renderPaymentsReportPdf({
    rows: buildPaidReportRows(sources(), { year: 2026, month: 8 }),
    state: "approved",
    houseLabel: "Todas",
    tenantLabel: "Todos",
    year: 2026,
    month: 8,
    cutoff: { year: 2026, month: 8 },
  })

  assert.equal(report.filename, "payments-report-paid-2026-m8.pdf")
  assert.match(report.subject, /Inquilinos al dia/)
  assert.equal(Buffer.from(report.bytes).subarray(0, 5).toString(), "%PDF-")

  const pdf = await PDFDocument.load(report.bytes)
  assert.ok(pdf.getPageCount() >= 1)
})

test("renders an unpaid PDF that includes tenants without a payment record", async () => {
  const report = await renderPaymentsReportPdf({
    rows: buildUnpaidReportRows(sources(), {}, { year: 2026, month: 8 }),
    state: "pending",
    houseLabel: "Todas",
    tenantLabel: "Todos",
    cutoff: { year: 2026, month: 8 },
  })

  assert.equal(report.filename, "payments-report-unpaid.pdf")
  assert.match(report.subject, /Inquilinos con deudas/)
  assert.match(report.filtersLabel, /Estado: Con deudas/)
  assert.match(report.filtersLabel, /Corte: hasta Agosto 2026/)
  assert.equal(Buffer.from(report.bytes).subarray(0, 5).toString(), "%PDF-")

  const pdf = await PDFDocument.load(report.bytes)
  assert.ok(pdf.getPageCount() >= 1)
})
