import assert from "node:assert/strict"
import test from "node:test"
import { inflateSync } from "node:zlib"
import { setCollectionGetterForTests } from "./mongodb"
import {
  buildPaidReportRows,
  buildPaymentReportRows,
  buildUnpaidReportRows,
  type ReportRowSources,
} from "./payment-report-rows"
import { PaymentsReportError, buildPaymentsReport, loadReportSources } from "./payments-report"
import { renderPaymentsReportPdf } from "./payments-report-pdf"

const ym = (year: number, month: number) => ({ year, month })

function sources(): ReportRowSources {
  return {
    houses: [{ id: "h1", name: "Cedar House" }],
    tenants: [
      {
        id: "t1",
        name: "Ana Peña",
        houseId: "h1",
        houseName: "Cedar House",
        email: "ana@example.com",
        parentName: "Rosa Peña",
        guardianTypeId: "TI",
        guardianIdNumber: "1020",
      },
      {
        id: "t2",
        name: "Luis Soto",
        houseId: "h1",
        houseName: "Cedar House",
        isDeleted: true,
        email: "luis@example.com",
        parentName: "Marta Soto",
        guardianTypeId: "PEP",
        guardianIdNumber: "",
      },
    ],
    contracts: [
      {
        id: "c1",
        tenantId: "t1",
        tenantName: "Ana Peña",
        startDate: "2026-07-01",
        endDate: "2027-07-01",
        monthlyPrice: 300,
        status: "approved",
      },
    ],
    payments: [
      {
        id: "p1",
        tenantId: "t1",
        tenantName: "Ana Peña",
        contractId: "c1",
        houseName: "Cedar House",
        year: 2026,
        month: 7,
        amount: 300,
        state: "approved",
        createdAt: "2026-11-01T03:00:00.000Z",
      },
      {
        // Tenant was soft-deleted later, the payment still has to show its payer.
        id: "p2",
        tenantId: "t2",
        tenantName: "Luis Soto",
        contractId: "c-old",
        houseName: "Cedar House",
        year: 2026,
        month: 8,
        amount: 100,
        state: "approved",
      },
    ],
  }
}

// pdf-lib deflates page content and writes Helvetica text as hex strings.
function pdfText(bytes: Uint8Array) {
  const raw = Buffer.from(bytes).toString("latin1")
  const out: string[] = []
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content: string
    try {
      content = inflateSync(Buffer.from(match[1], "latin1")).toString("latin1")
    } catch {
      continue
    }
    for (const hex of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
      out.push(Buffer.from(hex[1], "hex").toString("latin1"))
    }
  }
  return out.join("\n")
}

const render = (rows: ReturnType<typeof buildPaidReportRows>, detail: "full" | "summary") =>
  renderPaymentsReportPdf({
    rows,
    state: "approved",
    houseLabel: "Todas",
    tenantLabel: "Todos",
    period: { from: ym(2026, 7), to: ym(2026, 10) },
    detail,
    cutoff: ym(2026, 10),
    generatedAt: new Date("2026-11-01T03:00:00Z"),
  })

test("full rows carry tenant email and the guardian's name and document", () => {
  const rows = buildPaidReportRows(sources(), { from: ym(2026, 7), to: ym(2026, 10) })
  const ana = rows.find((row) => row.id === "p1")
  assert.equal(ana?.tenantEmail, "ana@example.com")
  assert.equal(ana?.payerName, "Rosa Peña")
  assert.equal(ana?.payerDocument, "TI 1020")
  assert.equal(ana?.createdAt, "2026-11-01T03:00:00.000Z")
  const luis = rows.find((row) => row.id === "p2")
  assert.equal(luis?.payerDocument, "sin documento")
})

test("summary detail removes the payer and email fields from the rows", () => {
  const summary = buildPaymentReportRows(
    sources(),
    { state: "approved", from: ym(2026, 7), to: ym(2026, 10) },
    ym(2026, 10),
    "summary"
  )
  assert.ok(summary.length > 0)
  for (const row of summary) {
    assert.equal("payerName" in row, false)
    assert.equal("payerDocument" in row, false)
    assert.equal("tenantEmail" in row, false)
  }
  const full = buildPaymentReportRows(
    sources(),
    { state: "approved", from: ym(2026, 7), to: ym(2026, 10) },
    ym(2026, 10),
    "full"
  )
  assert.equal(full.find((row) => row.id === "p1")?.payerName, "Rosa Peña")
})

test("the summary PDF has no guardian or email text, the full PDF has it", async () => {
  const rows = buildPaidReportRows(sources(), { from: ym(2026, 7), to: ym(2026, 10) })
  const full = pdfText((await render(rows, "full")).bytes)
  assert.match(full, /Rosa Peña/)
  assert.match(full, /TI 1020/)
  assert.match(full, /ana@example\.com/)
  assert.match(full, /Correo \(inquilino\)/)
  assert.match(full, /31\/10\/2026/)
  assert.match(full, /Periodo: Julio 2026 a Octubre 2026/)

  const summary = pdfText((await render(rows, "summary")).bytes)
  assert.doesNotMatch(summary, /Rosa Peña/)
  assert.doesNotMatch(summary, /TI 1020/)
  assert.doesNotMatch(summary, /ana@example\.com/)
  assert.doesNotMatch(summary, /Acudiente/)
  assert.match(summary, /Ana Peña/)
  assert.match(summary, /31\/10\/2026/)
})

test("filename and filters label use the period", async () => {
  const rows = buildPaidReportRows(sources(), { from: ym(2026, 7), to: ym(2026, 10) })
  const report = await render(rows, "full")
  assert.equal(report.filename, "payments-report-paid-2026-07-a-2026-10.pdf")
  assert.match(report.filtersLabel, /Periodo: Julio 2026 a Octubre 2026/)
  assert.doesNotMatch(report.filtersLabel, /Año|Mes:/)
})

test("long names, newlines and unsupported characters render without throwing", async () => {
  const data = sources()
  data.tenants[0].name = "Ana María de los Ángeles Peña Ñandú de la Santísima Trinidad 😀 Łukasz\nSegundo"
  data.tenants[0].email = "una.direccion.de.correo.muy.larga.sin.espacios.para.probar@ejemplo-dominio-largo.com"
  data.payments[0].tenantName = data.tenants[0].name
  const rows = buildPaidReportRows(data, { from: ym(2026, 7), to: ym(2026, 10) })
  const report = await render(rows, "full")
  const text = pdfText(report.bytes)
  assert.match(text, /Peña/)
  assert.doesNotMatch(text, /😀/)
})

test("unpaid months are clamped to the cutoff month", () => {
  const rows = buildUnpaidReportRows(
    { ...sources(), payments: [] },
    { from: ym(2026, 7), to: ym(2027, 3) },
    ym(2026, 9)
  )
  const months = rows.filter((row) => row.tenantId === "t1").map((row) => row.month)
  assert.deepEqual(months.sort(), [7, 8, 9])
  const after = buildUnpaidReportRows({ ...sources(), payments: [] }, { from: ym(2026, 11) }, ym(2026, 9))
  assert.equal(after.length, 0)
})

function memoryCollection(docs: Record<string, unknown>[], seenQueries: unknown[]) {
  return {
    find(query?: unknown) {
      seenQueries.push(query)
      return { toArray: async () => docs }
    },
  }
}

test("loadReportSources loads soft-deleted tenants so payers can still be found", async (t) => {
  const queries: unknown[] = []
  const collections: Record<string, Record<string, unknown>[]> = {
    houses: [{ _id: "h1", name: "Cedar House" }],
    tenants: [
      { _id: "t1", name: "Ana", houseId: "h1", houseName: "Cedar House", parentName: "Rosa", guardianTypeId: "CC", guardianIdNumber: "5" },
      { _id: "t2", name: "Luis", houseId: "h1", houseName: "Cedar House", isDeleted: true, parentName: "Marta", guardianTypeId: "PEP", guardianIdNumber: "9" },
    ],
    contracts: [],
    payments: [],
  }
  setCollectionGetterForTests(async (name: string) => memoryCollection(collections[name], name === "tenants" ? queries : []) as never)
  t.after(() => setCollectionGetterForTests(null))

  const loaded = await loadReportSources()
  assert.deepEqual(loaded.tenants.map((tenant) => tenant.id), ["t1", "t2"])
  assert.equal(loaded.tenants[1].isDeleted, true)
  assert.equal(loaded.tenants[1].parentName, "Marta")
  assert.equal(JSON.stringify(queries).includes("isDeleted"), false)
})

test("buildPaymentsReport rejects a from after to and a malformed month", async (t) => {
  setCollectionGetterForTests(async () => memoryCollection([], []) as never)
  t.after(() => setCollectionGetterForTests(null))

  await assert.rejects(
    buildPaymentsReport({ from: "2026-10", to: "2026-07" }),
    (error: unknown) => error instanceof PaymentsReportError && error.status === 400
  )
  await assert.rejects(
    buildPaymentsReport({ from: "2026-7" }),
    (error: unknown) => error instanceof PaymentsReportError && error.status === 400
  )
  const report = await buildPaymentsReport({ from: "2026-07", to: "2026-10" })
  assert.equal(report.filename, "payments-report-paid-2026-07-a-2026-10.pdf")
})
