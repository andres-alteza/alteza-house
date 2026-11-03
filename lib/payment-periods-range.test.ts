import assert from "node:assert/strict"
import test from "node:test"
import {
  isInMonthRange,
  monthIndex,
  parseStrictYearMonth,
  resolveReportPeriod,
} from "./payment-periods"

const ym = (year: number, month: number) => ({ year, month })

test("range compares year*12+month, inclusive, across a year change", () => {
  const range = { from: ym(2025, 11), to: ym(2026, 2) }
  assert.equal(monthIndex(ym(2026, 2)), 2026 * 12 + 2)
  assert.equal(isInMonthRange(ym(2025, 10), range), false)
  assert.equal(isInMonthRange(ym(2025, 11), range), true)
  assert.equal(isInMonthRange(ym(2025, 12), range), true)
  assert.equal(isInMonthRange(ym(2026, 2), range), true)
  assert.equal(isInMonthRange(ym(2026, 3), range), false)
  // plain month number alone would wrongly let 2025-12 > 2026-02 compare as smaller/greater
  assert.equal(isInMonthRange(ym(2024, 12), range), false)
})

test("a single bound is open-ended", () => {
  assert.equal(isInMonthRange(ym(2030, 1), { from: ym(2026, 7) }), true)
  assert.equal(isInMonthRange(ym(2026, 6), { from: ym(2026, 7) }), false)
  assert.equal(isInMonthRange(ym(2000, 1), { to: ym(2026, 7) }), true)
  assert.equal(isInMonthRange(ym(2026, 8), { to: ym(2026, 7) }), false)
  assert.equal(isInMonthRange(ym(1999, 1), {}), true)
})

test("parseStrictYearMonth only accepts YYYY-MM", () => {
  assert.deepEqual(parseStrictYearMonth("2026-07"), ym(2026, 7))
  assert.equal(parseStrictYearMonth("2026-13"), null)
  assert.equal(parseStrictYearMonth("2026-7"), null)
  assert.equal(parseStrictYearMonth(""), null)
  assert.equal(parseStrictYearMonth(undefined), null)
})

test("year/month aliases do not turn into all months", () => {
  const now = ym(2026, 11)
  assert.deepEqual(resolveReportPeriod({ year: 2026, month: 8 }, now), { from: ym(2026, 8), to: ym(2026, 8) })
  assert.deepEqual(resolveReportPeriod({ year: 2025 }, now), { from: ym(2025, 1), to: ym(2025, 12) })
  assert.deepEqual(resolveReportPeriod({ month: 3 }, now), { from: ym(2026, 3), to: ym(2026, 3) })
  assert.deepEqual(resolveReportPeriod({}, now), {})
})

test("from/to win over the aliases", () => {
  const period = resolveReportPeriod({ from: ym(2026, 7), to: ym(2026, 10), year: 2020, month: 1 })
  assert.deepEqual(period, { from: ym(2026, 7), to: ym(2026, 10) })
})
