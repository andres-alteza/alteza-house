export type YearMonth = {
  year: number
  month: number
}

export function getBogotaDateParts(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  const parts = formatter.formatToParts(now)
  const get = (type: "year" | "month" | "day") =>
    Number(parts.find((part) => part.type === type)?.value ?? 0)
  const year = get("year")
  const month = get("month")
  const day = get("day")
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  return { year, month, day, date }
}

export function parseYearMonth(value: string): YearMonth | null {
  const [yearRaw, monthRaw] = value.split("-")
  const year = Number.parseInt(yearRaw ?? "", 10)
  const month = Number.parseInt(monthRaw ?? "", 10)
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null
  }
  return { year, month }
}

export function toMonthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`
}

export function compareYearMonth(a: YearMonth, b: YearMonth) {
  if (a.year !== b.year) return a.year - b.year
  return a.month - b.month
}

export function coerceYearMonthNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : Number.NaN
  }
  return Number.NaN
}

export function* iterateContractMonths(
  startDate: string,
  endDate: string,
  target: YearMonth
): Generator<YearMonth> {
  const start = parseYearMonth(startDate)
  const end = parseYearMonth(endDate)
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

export function unpaidBalance(monthlyPrice: number, approvedAmount: number) {
  return Math.max(Number(monthlyPrice || 0) - Number(approvedAmount || 0), 0)
}
