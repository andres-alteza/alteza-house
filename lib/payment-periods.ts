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

/** A contract starting on day 16 or later owes rent from the next month; days 1-15 owe the start month. */
export const FIRST_OWED_MONTH_LATE_START_DAY = 16

/**
 * First month a contract owes rent. `startDate` is "YYYY-MM-DD" (a "YYYY-MM" value with no day
 * stays the start month). Start day 16 or later rolls to the next month (December to January).
 */
export function firstOwedMonth(startDate: string): YearMonth | null {
  const start = parseYearMonth(startDate)
  if (!start) return null
  const day = Number.parseInt(startDate.split("-")[2] ?? "", 10)
  if (!Number.isInteger(day) || day < FIRST_OWED_MONTH_LATE_START_DAY) return start
  return start.month === 12 ? { year: start.year + 1, month: 1 } : { year: start.year, month: start.month + 1 }
}

/** True when the month is on or after the contract's first owed month (an unreadable start date stays owed). */
export function isMonthOwed(startDate: string, year: number, month: number) {
  const first = firstOwedMonth(startDate)
  if (!first) return true
  return compareYearMonth({ year, month }, first) >= 0
}

export function* iterateContractMonths(
  startDate: string,
  endDate: string,
  target: YearMonth
): Generator<YearMonth> {
  const start = firstOwedMonth(startDate)
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

export function monthIndex(value: YearMonth) {
  return value.year * 12 + value.month
}

export type MonthRange = {
  from?: YearMonth
  to?: YearMonth
}

/** Inclusive range check; a missing bound is open-ended. */
export function isInMonthRange(value: YearMonth, range: MonthRange) {
  const index = monthIndex(value)
  if (range.from && index < monthIndex(range.from)) return false
  if (range.to && index > monthIndex(range.to)) return false
  return true
}

const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export function parseStrictYearMonth(value: string | undefined | null): YearMonth | null {
  const text = (value ?? "").trim()
  if (!YEAR_MONTH_PATTERN.test(text)) return null
  return parseYearMonth(text)
}

/**
 * Turns the request period into a month range. `from`/`to` win. The older `year`/`month`
 * filters stay as aliases so a stale browser tab does not get every month back:
 * year+month = that month, year only = January to December, month only = that month of the current year.
 */
export function resolveReportPeriod(
  input: { from?: YearMonth; to?: YearMonth; year?: number; month?: number },
  now: YearMonth = getBogotaDateParts()
): MonthRange {
  if (input.from || input.to) return { from: input.from, to: input.to }
  const { year, month } = input
  if (year === undefined && month === undefined) return {}
  const resolvedYear = year ?? now.year
  if (month !== undefined) {
    const value = { year: resolvedYear, month }
    return { from: value, to: value }
  }
  return { from: { year: resolvedYear, month: 1 }, to: { year: resolvedYear, month: 12 } }
}
