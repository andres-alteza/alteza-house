import type { Payment } from "./types"

export type GroupablePayment = {
  year: number
  month: number
  houseName: string
  tenantName: string
  amount: number
  state?: string
}

export type PaymentHouseGroup<T extends GroupablePayment = Payment> = {
  houseName: string
  payments: T[]
  totalAmount: number
  pendingCount: number
}

export type PaymentMonthGroup<T extends GroupablePayment = Payment> = {
  key: string
  year: number
  month: number
  houses: PaymentHouseGroup<T>[]
  totalAmount: number
  pendingCount: number
  paymentCount: number
  houseCount: number
}

export function monthGroupKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`
}

export function houseGroupKey(monthKey: string, houseName: string) {
  return `${monthKey}::${houseName}`
}

function sumAmounts<T extends GroupablePayment>(payments: T[]) {
  return payments.reduce((sum, payment) => sum + payment.amount, 0)
}

function countPending<T extends GroupablePayment>(payments: T[]) {
  return payments.filter((payment) => payment.state === "pending").length
}

function compareNames(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: "base" })
}

function sortPayments<T extends GroupablePayment>(payments: T[]) {
  return [...payments].sort((a, b) => compareNames(a.tenantName, b.tenantName))
}

export function groupPaymentsByMonthAndHouse<T extends GroupablePayment>(
  payments: T[]
): PaymentMonthGroup<T>[] {
  const byMonth = new Map<string, T[]>()

  for (const payment of payments) {
    const key = monthGroupKey(payment.year, payment.month)
    const existing = byMonth.get(key)
    if (existing) {
      existing.push(payment)
    } else {
      byMonth.set(key, [payment])
    }
  }

  return [...byMonth.entries()]
    .map(([key, monthPayments]) => {
      const first = monthPayments[0]
      const byHouse = new Map<string, T[]>()

      for (const payment of monthPayments) {
        const houseName = payment.houseName || ""
        const existing = byHouse.get(houseName)
        if (existing) {
          existing.push(payment)
        } else {
          byHouse.set(houseName, [payment])
        }
      }

      const houses = [...byHouse.entries()]
        .sort(([left], [right]) => compareNames(left, right))
        .map(([houseName, housePayments]) => {
          const sorted = sortPayments(housePayments)
          return {
            houseName,
            payments: sorted,
            totalAmount: sumAmounts(sorted),
            pendingCount: countPending(sorted),
          }
        })

      return {
        key,
        year: first.year,
        month: first.month,
        houses,
        totalAmount: sumAmounts(monthPayments),
        pendingCount: countPending(monthPayments),
        paymentCount: monthPayments.length,
        houseCount: houses.length,
      }
    })
    .sort((left, right) => {
      if (left.year !== right.year) return right.year - left.year
      return right.month - left.month
    })
}
