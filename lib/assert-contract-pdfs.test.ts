import assert from "node:assert/strict"
import { test } from "node:test"
import {
  EmptyOrMissingContractPdfError,
  InvalidContractPdfKeyError,
  InvalidContractPdfTypeError,
  verifyContractPdfObjects,
} from "./contract-pdf-constraints.ts"

function pdfPrefix() {
  return Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
}

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
      return params.bytesByKey?.[objectKey] || pdfPrefix()
    },
  }
}

const unsignedKey = "tenants/tenant-1/contracts/contract-1-contract.pdf"
const signedKey = "tenants/tenant-1/contracts/contract-1-signed-contract.pdf"
const unsignedContext = {
  tenantId: "tenant-1",
  contractId: "contract-1",
  kind: "draft" as const,
  s3Prefix: "",
}
const signedContext = {
  tenantId: "tenant-1",
  contractId: "contract-1",
  kind: "signed" as const,
  s3Prefix: "",
}

test("rejects a non-PDF disguised as application/pdf", async () => {
  await assert.rejects(
    () =>
      verifyContractPdfObjects(
        [
          {
            objectKey: unsignedKey,
            filename: "contract.pdf",
            contentType: "application/pdf",
          },
        ],
        mockLookup({
          sizeByKey: { [unsignedKey]: 40 },
          contentTypeByKey: { [unsignedKey]: "application/pdf" },
          bytesByKey: { [unsignedKey]: jpegPrefix() },
        }),
        unsignedContext
      ),
    InvalidContractPdfTypeError
  )
})

test("rejects an empty contract PDF", async () => {
  await assert.rejects(
    () =>
      verifyContractPdfObjects(
        [
          {
            objectKey: unsignedKey,
            filename: "contract.pdf",
            contentType: "application/pdf",
          },
        ],
        mockLookup({
          sizeByKey: { [unsignedKey]: 0 },
          contentTypeByKey: { [unsignedKey]: "application/pdf" },
        }),
        unsignedContext
      ),
    EmptyOrMissingContractPdfError
  )
})

test("rejects another contract's key", async () => {
  const otherContractKey = "tenants/tenant-1/contracts/contract-2-signed-contract.pdf"
  await assert.rejects(
    () =>
      verifyContractPdfObjects(
        [
          {
            objectKey: otherContractKey,
            filename: "other.pdf",
            contentType: "application/pdf",
          },
        ],
        mockLookup({
          sizeByKey: { [otherContractKey]: 1200 },
          contentTypeByKey: { [otherContractKey]: "application/pdf" },
        }),
        signedContext
      ),
    InvalidContractPdfKeyError
  )
})

test("rejects another tenant's key", async () => {
  const otherTenantKey = "tenants/tenant-9/contracts/contract-1-signed-contract.pdf"
  await assert.rejects(
    () =>
      verifyContractPdfObjects(
        [
          {
            objectKey: otherTenantKey,
            filename: "stolen.pdf",
            contentType: "application/pdf",
          },
        ],
        mockLookup({
          sizeByKey: { [otherTenantKey]: 1200 },
          contentTypeByKey: { [otherTenantKey]: "application/pdf" },
        }),
        signedContext
      ),
    InvalidContractPdfKeyError
  )
})

test("approves a passing signed contract PDF", async () => {
  const verified = await verifyContractPdfObjects(
    [
      {
        objectKey: signedKey,
        filename: "signed.pdf",
        contentType: "application/pdf",
      },
    ],
    mockLookup({
      sizeByKey: { [signedKey]: 2048 },
      contentTypeByKey: { [signedKey]: "application/pdf" },
      bytesByKey: { [signedKey]: pdfPrefix() },
    }),
    signedContext
  )

  assert.equal(verified[0]?.size, 2048)
  assert.equal(verified[0]?.contentType, "application/pdf")
  assert.equal(verified[0]?.objectKey, signedKey)
})

test("approves a passing unsigned contract PDF", async () => {
  const verified = await verifyContractPdfObjects(
    [
      {
        objectKey: unsignedKey,
        filename: "draft.pdf",
        contentType: "application/pdf",
      },
    ],
    mockLookup({
      sizeByKey: { [unsignedKey]: 4096 },
      contentTypeByKey: { [unsignedKey]: "application/pdf" },
      bytesByKey: { [unsignedKey]: pdfPrefix() },
    }),
    unsignedContext
  )

  assert.equal(verified[0]?.size, 4096)
  assert.equal(verified[0]?.contentType, "application/pdf")
  assert.equal(verified[0]?.objectKey, unsignedKey)
})
