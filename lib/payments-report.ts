import { ObjectId } from "mongodb"
import { getCollection } from "@/lib/mongodb"
import {
  getBogotaDateParts,
  monthIndex,
  parseStrictYearMonth,
  resolveReportPeriod,
} from "@/lib/payment-periods"
import {
  buildPaymentReportRows,
  normalizeReportPayment,
  type ReportContract,
  type ReportDetail,
  type ReportFilters,
  type ReportHouse,
  type ReportPayment,
  type ReportTenant,
} from "@/lib/payment-report-rows"
import { renderPaymentsReportPdf } from "@/lib/payments-report-pdf"

export type { ReportDetail, ReportFilters }

/** What a caller asks for. `from`/`to` are "YYYY-MM"; `year`/`month` are older aliases. */
export type ReportRequest = {
  houseId?: string
  tenantId?: string
  from?: string
  to?: string
  year?: number
  month?: number
  state?: ReportFilters["state"]
}
export { renderPaymentsReportPdf }

type PaymentDoc = {
  _id: ObjectId
  tenantId: string
  tenantName: string
  contractId: string
  houseName: string
  month: unknown
  year: unknown
  amount: unknown
  state?: string
  createdAt?: unknown
}

type HouseDoc = {
  _id: ObjectId
  name: string
}

type TenantDoc = {
  _id: ObjectId
  name: string
  houseId?: string
  houseName?: string
  isDeleted?: boolean
  email?: string
  parentName?: string
  guardianTypeId?: string
  guardianIdNumber?: string
}

type ContractDoc = {
  _id: ObjectId
  tenantId: string
  tenantName: string
  startDate: string
  endDate: string
  monthlyPrice: number
  status: string
}

export class PaymentsReportError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "PaymentsReportError"
    this.status = status
  }
}

export async function loadReportSources() {
  const [housesCol, tenantsCol, contractsCol, paymentsCol] = await Promise.all([
    getCollection<HouseDoc>("houses"),
    getCollection<TenantDoc>("tenants"),
    getCollection<ContractDoc>("contracts"),
    getCollection<PaymentDoc>("payments"),
  ])

  const [houses, tenants, contracts, payments] = await Promise.all([
    housesCol.find().toArray(),
    // Soft-deleted tenants stay in: old payments still need their guardian (payer) data.
    tenantsCol.find().toArray(),
    contractsCol.find({ status: { $in: ["approved", "finished"] } }).toArray(),
    paymentsCol.find().toArray(),
  ])

  return {
    houses: houses.map(
      (house): ReportHouse => ({
        id: house._id.toString(),
        name: house.name ?? "",
      })
    ),
    tenants: tenants.map(
      (tenant): ReportTenant => ({
        id: tenant._id.toString(),
        name: tenant.name ?? "",
        houseId: tenant.houseId ?? "",
        houseName: tenant.houseName ?? "",
        isDeleted: tenant.isDeleted,
        email: tenant.email ?? "",
        parentName: tenant.parentName ?? "",
        guardianTypeId: tenant.guardianTypeId ?? "",
        guardianIdNumber: tenant.guardianIdNumber ?? "",
      })
    ),
    contracts: contracts.map(
      (contract): ReportContract => ({
        id: contract._id.toString(),
        tenantId: contract.tenantId,
        tenantName: contract.tenantName ?? "",
        startDate: contract.startDate,
        endDate: contract.endDate,
        monthlyPrice: Number(contract.monthlyPrice || 0),
        status: contract.status,
      })
    ),
    payments: payments
      .map((payment): ReportPayment | null =>
        normalizeReportPayment({
          id: payment._id.toString(),
          tenantId: payment.tenantId,
          tenantName: payment.tenantName,
          contractId: payment.contractId,
          houseName: payment.houseName,
          year: payment.year,
          month: payment.month,
          amount: payment.amount,
          state: payment.state,
          createdAt: payment.createdAt,
        })
      )
      .filter((payment): payment is ReportPayment => payment !== null),
  }
}

function parseRequestMonth(label: string, value: string | undefined) {
  if (value === undefined || value === "") return undefined
  const parsed = parseStrictYearMonth(value)
  if (!parsed) throw new PaymentsReportError(`Invalid ${label}, use YYYY-MM`, 400)
  return parsed
}

export async function buildPaymentsReport(
  request: ReportRequest,
  options: { detail?: ReportDetail } = {}
) {
  // Privacy first: callers that do not say otherwise get the version without payer details.
  const detail = options.detail ?? "summary"
  const { houseId, tenantId, state = "approved" } = request
  const cutoff = getBogotaDateParts()
  const period = resolveReportPeriod({
    from: parseRequestMonth("from", request.from),
    to: parseRequestMonth("to", request.to),
    year: request.year,
    month: request.month,
  })
  if (period.from && period.to && monthIndex(period.from) > monthIndex(period.to)) {
    throw new PaymentsReportError("Invalid period: from is after to", 400)
  }
  let houseLabel = "Todas"
  let tenantLabel = "Todos"

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
  }

  const sources = await loadReportSources()
  const rows = buildPaymentReportRows(sources, { houseId, tenantId, ...period, state }, cutoff, detail)

  return renderPaymentsReportPdf({
    rows,
    state,
    houseLabel,
    tenantLabel,
    period,
    detail,
    cutoff,
  })
}
