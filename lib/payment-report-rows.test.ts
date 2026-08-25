import assert from "node:assert/strict"
import { test } from "node:test"
import { groupPaymentsByMonthAndHouse } from "./group-payments.ts"
import {
  buildPaidReportRows,
  buildUnpaidReportRows,
  normalizeReportPayment,
  type ReportRowSources,
} from "./payment-report-rows.ts"

function sources(overrides: Partial<ReportRowSources> = {}): ReportRowSources {
  return {
    houses: [
      { id: "house-cedar", name: "Cedar House" },
      { id: "house-birch", name: "Birch House" },
    ],
    tenants: [
      { id: "tenant-ana", name: "Ana", houseId: "house-cedar", houseName: "Cedar House" },
      { id: "tenant-luis", name: "Luis", houseId: "house-birch", houseName: "Birch House" },
      { id: "tenant-mara", name: "Mara", houseId: "house-cedar", houseName: "Cedar House" },
    ],
    contracts: [
      {
        id: "contract-ana",
        tenantId: "tenant-ana",
        tenantName: "Ana",
        startDate: "2026-06-01",
        endDate: "2026-12-31",
        monthlyPrice: 200,
        status: "approved",
      },
      {
        id: "contract-luis",
        tenantId: "tenant-luis",
        tenantName: "Luis",
        startDate: "2026-07-01",
        endDate: "2026-12-31",
        monthlyPrice: 300,
        status: "approved",
      },
      {
        id: "contract-mara",
        tenantId: "tenant-mara",
        tenantName: "Mara",
        startDate: "2026-08-01",
        endDate: "2026-12-31",
        monthlyPrice: 150,
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
      {
        id: "pay-luis-aug",
        tenantId: "tenant-luis",
        tenantName: "Luis",
        contractId: "contract-luis",
        houseName: "Birch House",
        year: 2026,
        month: 8,
        amount: 300,
        state: "pending",
      },
      {
        id: "pay-mara-aug",
        tenantId: "tenant-mara",
        tenantName: "Mara",
        contractId: "contract-mara",
        houseName: "Cedar House",
        year: 2026,
        month: 8,
        amount: 150,
        state: "approved",
      },
    ],
    ...overrides,
  }
}

test("paid report includes only approved payments for the selected month", () => {
  const rows = buildPaidReportRows(sources(), { year: 2026, month: 8 })
  assert.deepEqual(
    rows.map((row) => row.tenantName).sort(),
    ["Ana", "Mara"]
  )
  assert.ok(rows.every((row) => row.state === "approved"))
  assert.ok(rows.every((row) => row.year === 2026 && row.month === 8))
})

test("paid report groups by house like the payments page", () => {
  const grouped = groupPaymentsByMonthAndHouse(buildPaidReportRows(sources(), { year: 2026, month: 8 }))
  assert.equal(grouped.length, 1)
  assert.deepEqual(
    grouped[0].houses.map((house) => house.houseName),
    ["Cedar House"]
  )
  assert.deepEqual(
    grouped[0].houses[0].payments.map((row) => row.tenantName),
    ["Ana", "Mara"]
  )
})

test("unpaid report includes missing months and pending proofs, not approved months", () => {
  const rows = buildUnpaidReportRows(sources(), {}, { year: 2026, month: 8 })
  const keys = rows
    .map((row) => `${row.tenantName}:${row.month}:${row.state}:${row.amount}`)
    .sort()

  assert.deepEqual(keys, [
    "Ana:6:unpaid:200",
    "Ana:7:unpaid:200",
    "Luis:7:unpaid:300",
    "Luis:8:pending:300",
  ])
})

test("unpaid report ignores tenants without an approved or finished contract", () => {
  const data = sources({
    contracts: [
      {
        id: "draft",
        tenantId: "tenant-ana",
        tenantName: "Ana",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        monthlyPrice: 200,
        status: "ready_to_sign",
      },
    ],
    payments: [],
  })

  const rows = buildUnpaidReportRows(data, {}, { year: 2026, month: 8 })
  assert.equal(rows.length, 0)
})

test("unpaid report can filter a single house and still keep month/house grouping", () => {
  const rows = buildUnpaidReportRows(sources(), { houseId: "house-birch" }, { year: 2026, month: 8 })
  const grouped = groupPaymentsByMonthAndHouse(rows)

  assert.deepEqual(
    grouped.map((group) => group.key),
    ["2026-08", "2026-07"]
  )
  assert.ok(grouped.every((group) => group.houses.every((house) => house.houseName === "Birch House")))
  assert.equal(grouped[0].houses[0].payments[0].tenantName, "Luis")
})

test("normalizeReportPayment coerces string year and month values", () => {
  const payment = normalizeReportPayment({
    id: "1",
    tenantId: "tenant-ana",
    tenantName: "Ana",
    contractId: "contract-ana",
    houseName: "Cedar House",
    year: "2026",
    month: "8",
    amount: "200",
    state: "approved",
  })

  assert.equal(payment?.year, 2026)
  assert.equal(payment?.month, 8)
  assert.equal(payment?.amount, 200)
  assert.equal(payment?.state, "approved")
})

test("partial approved payments leave the remaining balance as unpaid", () => {
  const data = sources({
    payments: [
      {
        id: "partial",
        tenantId: "tenant-luis",
        tenantName: "Luis",
        contractId: "contract-luis",
        houseName: "Birch House",
        year: 2026,
        month: 8,
        amount: 100,
        state: "approved",
      },
    ],
  })

  const rows = buildUnpaidReportRows(data, { tenantId: "tenant-luis", year: 2026, month: 8 }, {
    year: 2026,
    month: 8,
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].amount, 200)
  assert.equal(rows[0].state, "unpaid")
})
