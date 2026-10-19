import assert from "node:assert/strict"
import { test } from "node:test"
import {
  EmptyOrMissingProofError,
  InvalidProofTypeError,
  verifyProofObjects,
} from "./payment-proof-constraints.ts"

function jpegPrefix() {
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
}

function mockLookup(params: {
  sizeByKey: Record<string, number | undefined>
  missingKeys?: string[]
  bytesByKey?: Record<string, Uint8Array>
}) {
  const missing = new Set(params.missingKeys || [])
  return {
    headObject: async (objectKey: string) => {
      if (missing.has(objectKey)) return null
      return { ContentLength: params.sizeByKey[objectKey] }
    },
    getObjectPrefix: async (objectKey: string) => {
      if (missing.has(objectKey)) return null
      return params.bytesByKey?.[objectKey] || jpegPrefix()
    },
  }
}

test("rejects a payment with no attachments", async () => {
  await assert.rejects(
    () =>
      verifyProofObjects(
        [],
        mockLookup({
          sizeByKey: {},
        })
      ),
    EmptyOrMissingProofError
  )
})

test("approves older attachments that have no stored size when HeadObject reports bytes", async () => {
  const verified = await verifyProofObjects(
    [
      {
        objectKey: "tenants/a/payments/legacy.jpg",
        filename: "IMG-20260318-WA0004.jpg",
        contentType: "image/jpeg",
      },
    ],
    mockLookup({
      sizeByKey: { "tenants/a/payments/legacy.jpg": 18432 },
      bytesByKey: { "tenants/a/payments/legacy.jpg": jpegPrefix() },
    })
  )

  assert.equal(verified[0]?.size, 18432)
})

test("rejects a missing object by filename", async () => {
  await assert.rejects(
    () =>
      verifyProofObjects(
        [
          {
            objectKey: "tenants/a/payments/gone.jpg",
            filename: "IMG-20260318-WA0001.jpg",
            contentType: "image/jpeg",
          },
        ],
        mockLookup({
          sizeByKey: {},
          missingKeys: ["tenants/a/payments/gone.jpg"],
        })
      ),
    (error: unknown) => {
      assert.ok(error instanceof EmptyOrMissingProofError)
      assert.equal(error.filename, "IMG-20260318-WA0001.jpg")
      assert.match(error.message, /IMG-20260318-WA0001.jpg/)
      return true
    }
  )
})

test("rejects a 0-byte object even when a size was not stored on the payment", async () => {
  await assert.rejects(
    () =>
      verifyProofObjects(
        [
          {
            objectKey: "tenants/a/payments/empty.jpg",
            filename: "IMG-20260318-WA0002.jpg",
            contentType: "image/jpeg",
          },
        ],
        mockLookup({
          sizeByKey: { "tenants/a/payments/empty.jpg": 0 },
        })
      ),
    EmptyOrMissingProofError
  )
})

test("rejects jpeg claims whose first bytes are not a jpeg", async () => {
  await assert.rejects(
    () =>
      verifyProofObjects(
        [
          {
            objectKey: "tenants/a/payments/fake.jpg",
            filename: "fake.jpg",
            contentType: "image/jpeg",
          },
        ],
        mockLookup({
          sizeByKey: { "tenants/a/payments/fake.jpg": 40 },
          bytesByKey: { "tenants/a/payments/fake.jpg": Uint8Array.from([0x00, 0x01, 0x02, 0x03]) },
        })
      ),
    InvalidProofTypeError
  )
})
