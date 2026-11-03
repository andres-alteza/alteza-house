import { formatIdDocument } from "./id-types"
import {
  coerceYearMonthNumber,
  isInMonthRange,
  iterateContractMonths,
  toMonthKey,
  unpaidBalance,
  type MonthRange,
  type YearMonth,
} from "./payment-periods"

export type ReportFilters = MonthRange & {
  houseId?: string
  tenantId?: string
  state?: "pending" | "approved" | "all"
}

/** "full" shows payer name, document and tenant email. "summary" leaves them out (used for the cron email). */
export type ReportDetail = "full" | "summary"

export type PaymentReportState = "approved" | "pending" | "unpaid"

export type PaymentReportRow = {
  id: string
  tenantId: string
  tenantName: string
  houseName: string
  year: number
  month: number
  amount: number
  state: PaymentReportState
  /** Payment createdAt (ISO). Empty for unpaid months. */
  createdAt?: string
  /** Tenant email. Only in "full" detail. */
  tenantEmail?: string
  /** Acudiente (guardian) name. Only in "full" detail. */
  payerName?: string
  /** Acudiente document, e.g. "CC 123" or "sin documento". Only in "full" detail. */
  payerDocument?: string
}

export type ReportHouse = {
  id: string
  name: string
}

export type ReportTenant = {
  id: string
  name: string
  houseId: string
  houseName: string
  isDeleted?: boolean
  email?: string
  parentName?: string
  guardianTypeId?: string
  guardianIdNumber?: string
}

export type ReportContract = {
  id: string
  tenantId: string
  tenantName: string
  startDate: string
  endDate: string
  monthlyPrice: number
  status: string
}

export type ReportPayment = {
  id: string
  tenantId: string
  tenantName: string
  contractId: string
  houseName: string
  year: number
  month: number
  amount: number
  state: "pending" | "approved"
  createdAt?: string
}

export type ReportRowSources = {
  houses: ReportHouse[]
  tenants: ReportTenant[]
  contracts: ReportContract[]
  payments: ReportPayment[]
}

const REPORTABLE_CONTRACT_STATUSES = new Set(["approved", "finished"])

function resolveHouseName(
  tenant: ReportTenant | undefined,
  housesById: Map<string, ReportHouse>,
  fallbackHouseName?: string
) {
  if (tenant?.houseId) {
    const house = housesById.get(tenant.houseId)
    if (house?.name) return house.name
  }
  return tenant?.houseName || fallbackHouseName || ""
}

function matchesHouseFilter(
  tenant: ReportTenant | undefined,
  houseName: string,
  houseId?: string,
  selectedHouse?: ReportHouse
) {
  if (!houseId) return true
  if (tenant?.houseId === houseId) return true
  return Boolean(selectedHouse?.name && houseName === selectedHouse.name)
}

function matchesTenantFilter(tenantId: string, filterTenantId?: string) {
  if (!filterTenantId) return true
  return tenantId === filterTenantId
}

function payerFields(tenant: ReportTenant | undefined) {
  return {
    tenantEmail: (tenant?.email ?? "").trim(),
    payerName: (tenant?.parentName ?? "").trim(),
    payerDocument: formatIdDocument(tenant?.guardianTypeId, tenant?.guardianIdNumber),
  }
}

export function toSummaryRow(row: PaymentReportRow): PaymentReportRow {
  const { tenantEmail: _email, payerName: _name, payerDocument: _document, ...rest } = row
  return rest
}

function toIsoString(value: unknown) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString()
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
  }
  return undefined
}

export function normalizeReportPayment(payment: {
  id: string
  tenantId: string
  tenantName: string
  contractId: string
  houseName: string
  year: unknown
  month: unknown
  amount: unknown
  state?: string
  createdAt?: unknown
}): ReportPayment | null {
  const year = coerceYearMonthNumber(payment.year)
  const month = coerceYearMonthNumber(payment.month)
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null
  }

  const state = payment.state === "approved" ? "approved" : "pending"
  return {
    id: payment.id,
    tenantId: payment.tenantId,
    tenantName: payment.tenantName,
    contractId: payment.contractId,
    houseName: payment.houseName,
    year,
    month,
    amount: Number(payment.amount || 0),
    state,
    createdAt: toIsoString(payment.createdAt),
  }
}

export function buildPaidReportRows(
  sources: ReportRowSources,
  filters: Pick<ReportFilters, "houseId" | "tenantId" | "from" | "to">
): PaymentReportRow[] {
  const housesById = new Map(sources.houses.map((house) => [house.id, house]))
  const tenantsById = new Map(sources.tenants.map((tenant) => [tenant.id, tenant]))
  const selectedHouse = filters.houseId ? housesById.get(filters.houseId) : undefined

  return sources.payments
    .filter((payment) => payment.state === "approved")
    .filter((payment) => isInMonthRange(payment, filters))
    .filter((payment) => matchesTenantFilter(payment.tenantId, filters.tenantId))
    .map((payment) => {
      const tenant = tenantsById.get(payment.tenantId)
      const houseName = resolveHouseName(tenant, housesById, payment.houseName)
      return {
        id: payment.id,
        tenantId: payment.tenantId,
        tenantName: tenant?.name || payment.tenantName || "-",
        houseName,
        year: payment.year,
        month: payment.month,
        amount: payment.amount,
        state: "approved" as const,
        createdAt: payment.createdAt,
        ...payerFields(tenant),
      }
    })
    .filter((row) =>
      matchesHouseFilter(tenantsById.get(row.tenantId), row.houseName, filters.houseId, selectedHouse)
    )
}

export function buildUnpaidReportRows(
  sources: ReportRowSources,
  filters: Pick<ReportFilters, "houseId" | "tenantId" | "from" | "to">,
  cutoff: YearMonth
): PaymentReportRow[] {
  const housesById = new Map(sources.houses.map((house) => [house.id, house]))
  const tenantsById = new Map(sources.tenants.map((tenant) => [tenant.id, tenant]))
  const selectedHouse = filters.houseId ? housesById.get(filters.houseId) : undefined

  const approvedByContractMonth = new Map<string, number>()
  const pendingByContractMonth = new Set<string>()

  for (const payment of sources.payments) {
    const key = `${payment.contractId}|${toMonthKey(payment.year, payment.month)}`
    if (payment.state === "approved") {
      approvedByContractMonth.set(key, (approvedByContractMonth.get(key) ?? 0) + payment.amount)
    } else {
      pendingByContractMonth.add(key)
    }
  }

  const rows: PaymentReportRow[] = []

  for (const contract of sources.contracts) {
    if (!REPORTABLE_CONTRACT_STATUSES.has(contract.status)) continue

    const tenant = tenantsById.get(contract.tenantId)
    if (!tenant || tenant.isDeleted) continue
    if (!matchesTenantFilter(contract.tenantId, filters.tenantId)) continue

    const houseName = resolveHouseName(tenant, housesById)
    if (!matchesHouseFilter(tenant, houseName, filters.houseId, selectedHouse)) continue

    for (const period of iterateContractMonths(contract.startDate, contract.endDate, cutoff)) {
      if (!isInMonthRange(period, filters)) continue

      const monthKey = `${contract.id}|${toMonthKey(period.year, period.month)}`
      const approvedAmount = approvedByContractMonth.get(monthKey) ?? 0
      const balance = unpaidBalance(contract.monthlyPrice, approvedAmount)
      if (balance <= 0) continue

      rows.push({
        id: monthKey,
        tenantId: contract.tenantId,
        tenantName: tenant?.name || contract.tenantName || "-",
        houseName,
        year: period.year,
        month: period.month,
        amount: balance,
        state: pendingByContractMonth.has(monthKey) ? "pending" : "unpaid",
        ...payerFields(tenant),
      })
    }
  }

  return rows
}

export function buildPaymentReportRows(
  sources: ReportRowSources,
  filters: ReportFilters,
  cutoff: YearMonth,
  detail: ReportDetail = "summary"
): PaymentReportRow[] {
  const paid = filters.state === "pending" ? [] : buildPaidReportRows(sources, filters)
  const unpaid = filters.state === "approved" ? [] : buildUnpaidReportRows(sources, filters, cutoff)
  const rows = [...paid, ...unpaid]
  return detail === "full" ? rows : rows.map(toSummaryRow)
}
