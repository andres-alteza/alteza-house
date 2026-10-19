import assert from "node:assert/strict"
import { test } from "node:test"
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"
import {
  EmptyOrMissingProofError,
  InvalidProofKeyError,
  InvalidProofTypeError,
  verifyProofObjects,
} from "./payment-proof-constraints.ts"
import { assertProofAttachmentsInS3, isS3NotFound } from "./assert-payment-proofs.ts"

function jpegPrefix() {
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
}

function mockLookup(params: {
  sizeByKey: Record<string, number | undefined>
  missingKeys?: string[]
  bytesByKey?: Record<string, Uint8Array>
  contentTypeByKey?: Record<string, string>
}) {
  const missing = new Set(params.missingKeys || [])
  return {
    headObject: async (objectKey: string) => {
      if (missing.has(objectKey)) return null
      return {
        ContentLength: params.sizeByKey[objectKey],
        ContentType: params.contentTypeByKey?.[objectKey],
      }
    },
    getObjectPrefix: async (objectKey: string) => {
      if (missing.has(objectKey)) return null
      return params.bytesByKey?.[objectKey] || jpegPrefix()
    },
  }
}

const tenantContext = { tenantId: "a", s3Prefix: "" }

test("rejects a payment with no attachments", async () => {
  await assert.rejects(
    () =>
      verifyProofObjects(
        [],
        mockLookup({
          sizeByKey: {},
        }),
        tenantContext
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
        contentType: "image/webp",
      },
    ],
    mockLookup({
      sizeByKey: { "tenants/a/payments/legacy.jpg": 18432 },
      contentTypeByKey: { "tenants/a/payments/legacy.jpg": "image/jpeg" },
      bytesByKey: { "tenants/a/payments/legacy.jpg": jpegPrefix() },
    }),
    tenantContext
  )

  assert.equal(verified[0]?.size, 18432)
  assert.equal(verified[0]?.contentType, "image/jpeg")
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
        }),
        tenantContext
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
        }),
        tenantContext
      ),
    EmptyOrMissingProofError
  )
})

test("uses HeadObject ContentType instead of the client-claimed type", async () => {
  await assert.rejects(
    () =>
      verifyProofObjects(
        [
          {
            objectKey: "tenants/a/payments/fake.webp",
            filename: "fake.webp",
            contentType: "image/webp",
          },
        ],
        mockLookup({
          sizeByKey: { "tenants/a/payments/fake.webp": 40 },
          contentTypeByKey: { "tenants/a/payments/fake.webp": "image/webp" },
          bytesByKey: { "tenants/a/payments/fake.webp": jpegPrefix() },
        }),
        tenantContext
      ),
    InvalidProofTypeError
  )
})

test("rejects a key from another tenant", async () => {
  await assert.rejects(
    () =>
      verifyProofObjects(
        [
          {
            objectKey: "tenants/other/payments/2026/stolen.jpg",
            filename: "stolen.jpg",
            contentType: "image/jpeg",
          },
        ],
        mockLookup({
          sizeByKey: { "tenants/other/payments/2026/stolen.jpg": 100 },
        }),
        tenantContext
      ),
    InvalidProofKeyError
  )
})

test("rejects a contract object key", async () => {
  await assert.rejects(
    () =>
      verifyProofObjects(
        [
          {
            objectKey: "tenants/a/contracts/abc-signed-contract.pdf",
            filename: "contract.pdf",
            contentType: "application/pdf",
          },
        ],
        mockLookup({
          sizeByKey: { "tenants/a/contracts/abc-signed-contract.pdf": 100 },
        }),
        tenantContext
      ),
    InvalidProofKeyError
  )
})

test("treats S3 403 as a missing proof", async () => {
  const forbidden = Object.assign(new Error("Forbidden"), {
    name: "AccessDenied",
    $metadata: { httpStatusCode: 403 },
  })
  assert.equal(isS3NotFound(forbidden), true)

  const send = async (command: unknown) => {
    if (command instanceof HeadObjectCommand || command instanceof GetObjectCommand) {
      throw forbidden
    }
    throw new Error(`Unexpected command ${command?.constructor?.name}`)
  }

  await assert.rejects(
    () =>
      assertProofAttachmentsInS3(
        [
          {
            objectKey: "tenants/a/payments/hidden.jpg",
            filename: "hidden.jpg",
            contentType: "image/jpeg",
          },
        ],
        { tenantId: "a", s3Prefix: "", bucket: "house-proofs", send }
      ),
    EmptyOrMissingProofError
  )
})
