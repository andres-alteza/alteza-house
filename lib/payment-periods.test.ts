import assert from "node:assert/strict"
import { test } from "node:test"
import {
  compareYearMonth,
  firstOwedMonth,
  isMonthOwed,
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

test("firstOwedMonth: days 1 to 15 owe the start month, day 16 or later owes the next month", () => {
  assert.deepEqual(firstOwedMonth("2026-07-01"), { year: 2026, month: 7 })
  assert.deepEqual(firstOwedMonth("2026-07-15"), { year: 2026, month: 7 })
  assert.deepEqual(firstOwedMonth("2026-07-16"), { year: 2026, month: 8 })
  assert.deepEqual(firstOwedMonth("2026-06-23"), { year: 2026, month: 7 })
  assert.deepEqual(firstOwedMonth("2026-07-31"), { year: 2026, month: 8 })
})

test("firstOwedMonth: December rolls over to January of the next year", () => {
  assert.deepEqual(firstOwedMonth("2026-12-20"), { year: 2027, month: 1 })
  assert.deepEqual(firstOwedMonth("2026-12-10"), { year: 2026, month: 12 })
})

test("firstOwedMonth: a YYYY-MM start with no day stays the start month, bad input gives null", () => {
  assert.deepEqual(firstOwedMonth("2026-07"), { year: 2026, month: 7 })
  assert.equal(firstOwedMonth(""), null)
  assert.equal(firstOwedMonth("2026-13-01"), null)
})

test("iterateContractMonths starts the month after a start on day 16 or later", () => {
  const months = [...iterateContractMonths("2026-07-31", "2027-02-28", { year: 2026, month: 10 })]
  assert.deepEqual(months, [
    { year: 2026, month: 8 },
    { year: 2026, month: 9 },
    { year: 2026, month: 10 },
  ])
  const june = [...iterateContractMonths("2026-06-23", "2027-02-28", { year: 2026, month: 8 })]
  assert.deepEqual(june, [
    { year: 2026, month: 7 },
    { year: 2026, month: 8 },
  ])
  const day15 = [...iterateContractMonths("2026-07-15", "2026-12-31", { year: 2026, month: 7 })]
  assert.deepEqual(day15, [{ year: 2026, month: 7 }])
})

test("iterateContractMonths: a start on day 16 or later that ends before the next month owes nothing", () => {
  assert.deepEqual([...iterateContractMonths("2026-07-20", "2026-07-31", { year: 2026, month: 12 })], [])
  assert.deepEqual([...iterateContractMonths("2026-07-31", "2026-07-31", { year: 2026, month: 12 })], [])
})

test("iterateContractMonths rolls a December day-16+ start into January", () => {
  const months = [...iterateContractMonths("2026-12-20", "2027-06-30", { year: 2027, month: 2 })]
  assert.deepEqual(months, [
    { year: 2027, month: 1 },
    { year: 2027, month: 2 },
  ])
})

test("isMonthOwed: a start on day 16 or later owes nothing in its start month and owes the next month", () => {
  assert.equal(isMonthOwed("2026-07-20", 2026, 7), false)
  assert.equal(isMonthOwed("2026-07-16", 2026, 7), false)
  assert.equal(isMonthOwed("2026-07-31", 2026, 7), false)
  assert.equal(isMonthOwed("2026-07-20", 2026, 8), true)
  assert.equal(isMonthOwed("2026-07-20", 2027, 1), true)
  assert.equal(isMonthOwed("2026-07-20", 2026, 6), false, "months before the start are not owed")
})

test("isMonthOwed: a start on days 1 to 15 owes the start month as before", () => {
  assert.equal(isMonthOwed("2026-07-01", 2026, 7), true)
  assert.equal(isMonthOwed("2026-07-15", 2026, 7), true)
  assert.equal(isMonthOwed("2026-07-15", 2026, 8), true)
  assert.equal(isMonthOwed("2026-07-15", 2026, 6), false)
})

test("isMonthOwed: December day-16+ start rolls to January, and an unreadable start stays owed", () => {
  assert.equal(isMonthOwed("2026-12-20", 2026, 12), false)
  assert.equal(isMonthOwed("2026-12-20", 2027, 1), true)
  assert.equal(isMonthOwed("2026-07", 2026, 7), true)
  assert.equal(isMonthOwed("", 2026, 7), true)
})
