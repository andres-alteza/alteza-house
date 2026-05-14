import { ObjectId } from "mongodb"
import { getCollection } from "@/lib/mongodb"

type ContractDoc = {
  _id: ObjectId
  tenantId: string
  tenantName: string
  startDate: string
  endDate: string
  monthlyPrice: number
  status: "ready_to_sign" | "signed" | "approved" | "finished"
}

type PaymentDoc = {
  _id: ObjectId
  contractId: string
  tenantId: string
  month: number
  year: number
  amount: number
  state: "pending" | "approved"
}

type TenantDoc = {
  _id: ObjectId
  name: string
  email: string
  phone: string
  parentName: string
  parentPhone: string
  isDeleted?: boolean
}

export type PaymentReminderRecipient = {
  role: "tenant" | "guardian"
  name: string
  phone: string
}

export type OverduePaymentReminder = {
  tenantId: string
  tenantName: string
  contractId: string
  houseName?: string
  month: number
  year: number
  dueDateLabel: string
  pendingAmount: number
  unpaidMonths: Array<{ year: number; month: number; balance: number }>
  recipients: PaymentReminderRecipient[]
}

type ReminderPeriod = {
  year: number
  month: number
  paymentDueDate: number
}

const MONTH_LABELS = [
  "",
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
]

function parseYearMonth(value: string) {
  const [yearRaw, monthRaw] = value.split("-")
  const year = Number.parseInt(yearRaw ?? "", 10)
  const month = Number.parseInt(monthRaw ?? "", 10)
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null
  }
  return { year, month }
}

function toMonthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`
}

function compareYearMonth(a: { year: number; month: number }, b: { year: number; month: number }) {
  if (a.year !== b.year) return a.year - b.year
  return a.month - b.month
}

function* contractMonths(
  contract: ContractDoc,
  target: { year: number; month: number }
) {
  const start = parseYearMonth(contract.startDate)
  const end = parseYearMonth(contract.endDate)
  if (!start || !end) return

  const cappedEnd = compareYearMonth(end, target) < 0 ? end : target
  if (compareYearMonth(start, cappedEnd) > 0) return

  let year = start.year
  let month = start.month
  while (compareYearMonth({ year, month }, cappedEnd) <= 0) {
    yield { year, month }
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
}

function buildDueDateLabel({ year, month, paymentDueDate }: ReminderPeriod) {
  return `${paymentDueDate} de ${MONTH_LABELS[month] ?? String(month)} de ${year}`
}

function getMonthBounds(year: number, month: number) {
  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`
  const lastDayNumber = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const lastDay = `${year}-${String(month).padStart(2, "0")}-${String(lastDayNumber).padStart(2, "0")}`
  return { firstDay, lastDay }
}

function uniqueRecipients(tenant: TenantDoc): PaymentReminderRecipient[] {
  const rawRecipients: PaymentReminderRecipient[] = [
    { role: "tenant", name: tenant.name ?? "", phone: tenant.phone ?? "" },
    { role: "guardian", name: tenant.parentName || tenant.name || "", phone: tenant.parentPhone ?? "" },
  ]
  const seen = new Set<string>()

  return rawRecipients.filter((recipient) => {
    const phoneKey = recipient.phone.replace(/\D/g, "")
    if (!phoneKey || seen.has(phoneKey)) return false
    seen.add(phoneKey)
    return true
  })
}

export async function buildOverduePaymentReminders(
  period: ReminderPeriod
): Promise<OverduePaymentReminder[]> {
  const { firstDay, lastDay } = getMonthBounds(period.year, period.month)
  const contractsCol = await getCollection<ContractDoc>("contracts")
  const contracts = await contractsCol
    .find({
      status: "approved",
      startDate: { $lte: lastDay },
      endDate: { $gte: firstDay },
    })
    .sort({ tenantName: 1 })
    .toArray()

  if (!contracts.length) return []

  const tenantObjectIds = contracts
    .map((contract) => contract.tenantId)
    .filter((tenantId) => ObjectId.isValid(tenantId))
    .map((tenantId) => new ObjectId(tenantId))

  const tenantsCol = await getCollection<TenantDoc>("tenants")
  const tenants = await tenantsCol
    .find({ _id: { $in: tenantObjectIds }, isDeleted: { $ne: true } })
    .toArray()
  const tenantsById = new Map(tenants.map((tenant) => [tenant._id.toString(), tenant]))

  const contractIds = contracts.map((contract) => contract._id.toString())
  const paymentsCol = await getCollection<PaymentDoc>("payments")
  const approvedPayments = await paymentsCol
    .find({ contractId: { $in: contractIds }, state: "approved" })
    .toArray()

  const approvedByContractMonth = new Map<string, number>()
  for (const payment of approvedPayments) {
    const key = `${payment.contractId}|${toMonthKey(payment.year, payment.month)}`
    approvedByContractMonth.set(key, (approvedByContractMonth.get(key) ?? 0) + Number(payment.amount || 0))
  }

  const dueDateLabel = buildDueDateLabel(period)
  const reminders: OverduePaymentReminder[] = []

  for (const contract of contracts) {
    const tenant = tenantsById.get(contract.tenantId)
    if (!tenant) continue

    const contractId = contract._id.toString()
    const unpaidMonths: OverduePaymentReminder["unpaidMonths"] = []

    for (const { year, month } of contractMonths(contract, period)) {
      const approvedAmount = approvedByContractMonth.get(`${contractId}|${toMonthKey(year, month)}`) ?? 0
      const balance = Math.max(Number(contract.monthlyPrice || 0) - approvedAmount, 0)
      if (balance > 0) {
        unpaidMonths.push({ year, month, balance })
      }
    }

    const pendingAmount = unpaidMonths.reduce((total, item) => total + item.balance, 0)
    if (pendingAmount <= 0) continue

    reminders.push({
      tenantId: tenant._id.toString(),
      tenantName: tenant.name || contract.tenantName || "",
      contractId,
      month: period.month,
      year: period.year,
      dueDateLabel,
      pendingAmount,
      unpaidMonths,
      recipients: uniqueRecipients(tenant),
    })
  }

  return reminders
}

