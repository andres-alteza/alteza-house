import assert from "node:assert/strict"
import { test } from "node:test"
import {
  compareYearMonth,
  getBogotaDateParts,
  iterateContractMonths,
  unpaidBalance,
} from "./payment-periods.ts"

test("iterateContractMonths yields months from start through the cutoff", () => {
  const months = [...iterateContractMonths("2026-06-15", "2026-12-31", { year: 2026, month: 8 })]
  assert.deepEqual(months, [
    { year: 2026, month: 6 },
    { year: 2026, month: 7 },
    { year: 2026, month: 8 },
  ])
})

test("iterateContractMonths stops at the contract end when it is before the cutoff", () => {
  const months = [...iterateContractMonths("2026-01-01", "2026-03-31", { year: 2026, month: 8 })]
  assert.deepEqual(months, [
    { year: 2026, month: 1 },
    { year: 2026, month: 2 },
    { year: 2026, month: 3 },
  ])
})

test("unpaidBalance only counts approved rent", () => {
  assert.equal(unpaidBalance(300, 0), 300)
  assert.equal(unpaidBalance(300, 100), 200)
  assert.equal(unpaidBalance(300, 300), 0)
  assert.equal(unpaidBalance(300, 400), 0)
})

test("compareYearMonth orders earlier months first", () => {
  assert.ok(compareYearMonth({ year: 2025, month: 12 }, { year: 2026, month: 1 }) < 0)
  assert.equal(compareYearMonth({ year: 2026, month: 8 }, { year: 2026, month: 8 }), 0)
})

test("getBogotaDateParts returns a valid calendar date", () => {
  const parts = getBogotaDateParts(new Date("2026-08-25T18:00:00.000Z"))
  assert.equal(parts.year, 2026)
  assert.equal(parts.month, 8)
  assert.equal(parts.day, 25)
  assert.equal(parts.date, "2026-08-25")
})
