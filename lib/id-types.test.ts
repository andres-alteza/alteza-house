import assert from "node:assert/strict"
import test from "node:test"
import { ID_TYPE_OPTIONS, formatIdDocument } from "./id-types"

test("the form options keep the seven document types", () => {
  assert.deepEqual(
    ID_TYPE_OPTIONS.map((option) => option.value),
    ["CC", "TI", "RC", "CE", "PP", "PEP", "NIT"]
  )
})

test("formatIdDocument shows the real type, not a hard-coded C.C.", () => {
  assert.equal(formatIdDocument("TI", "1020304050"), "TI 1020304050")
  assert.equal(formatIdDocument("PEP", "99887766"), "PEP 99887766")
  assert.equal(formatIdDocument("cc", "123"), "CC 123")
})

test("an unknown type shows the raw code", () => {
  assert.equal(formatIdDocument("DNI", "55"), "DNI 55")
  assert.equal(formatIdDocument(" xyz ", "55"), "xyz 55")
})

test("a missing type shows only the number; sin documento only when the number is empty", () => {
  assert.equal(formatIdDocument("", "123"), "123")
  assert.equal(formatIdDocument(undefined, "123"), "123")
  assert.equal(formatIdDocument("CC", ""), "sin documento")
  assert.equal(formatIdDocument("CC", "   "), "sin documento")
  assert.equal(formatIdDocument("PEP", undefined), "sin documento")
})
