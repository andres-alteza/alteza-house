import assert from "node:assert/strict"
import { test } from "node:test"
import { groupPaymentsByMonthAndHouse, houseGroupKey, monthGroupKey } from "./group-payments.ts"
import type { Payment } from "./types.ts"

function payment(overrides: Partial<Payment> & Pick<Payment, "id" | "month" | "year" | "houseName" | "tenantName" | "amount">): Payment {
  return {
    tenantId: "tenant-1",
    tenantEmail: "tenant@example.com",
    contractId: "contract-1",
    state: "approved",
    proofAttachments: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

test("groups payments by newest month first and houses alphabetically", () => {
  const groups = groupPaymentsByMonthAndHouse([
    payment({
      id: "1",
      tenantName: "Zoe",
      houseName: "Cedar House",
      month: 1,
      year: 2026,
      amount: 100,
    }),
    payment({
      id: "2",
      tenantName: "Ana",
      houseName: "Cedar House",
      month: 8,
      year: 2026,
      amount: 200,
      state: "pending",
    }),
    payment({
      id: "3",
      tenantName: "Luis",
      houseName: "Birch House",
      month: 8,
      year: 2026,
      amount: 300,
    }),
    payment({
      id: "4",
      tenantName: "Mara",
      houseName: "Cedar House",
      month: 8,
      year: 2026,
      amount: 150,
    }),
  ])

  assert.deepEqual(
    groups.map((group) => group.key),
    ["2026-08", "2026-01"]
  )
  assert.equal(groups[0].paymentCount, 3)
  assert.equal(groups[0].houseCount, 2)
  assert.equal(groups[0].totalAmount, 650)
  assert.equal(groups[0].pendingCount, 1)
  assert.deepEqual(
    groups[0].houses.map((house) => house.houseName),
    ["Birch House", "Cedar House"]
  )
  assert.deepEqual(
    groups[0].houses[1].payments.map((item) => item.tenantName),
    ["Ana", "Mara"]
  )
  assert.equal(groups[0].houses[1].totalAmount, 350)
  assert.equal(groups[0].houses[1].pendingCount, 1)
  assert.equal(groups[1].houses[0].payments[0].tenantName, "Zoe")
})

test("treats an empty house name as its own group", () => {
  const groups = groupPaymentsByMonthAndHouse([
    payment({
      id: "1",
      tenantName: "Ana",
      houseName: "",
      month: 3,
      year: 2025,
      amount: 80,
    }),
  ])

  assert.equal(groups[0].key, monthGroupKey(2025, 3))
  assert.equal(groups[0].houses[0].houseName, "")
  assert.equal(houseGroupKey(groups[0].key, ""), "2025-03::")
})
