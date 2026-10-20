import assert from "node:assert/strict"
import { test } from "node:test"
import {
  CONTRACT_MAX_BYTES,
  contractPutObjectInput,
  expectedContractObjectKey,
  isAllowedContractObjectKey,
  isContractSizeAllowed,
  sniffContractMagicBytes,
} from "./contract-pdf-constraints.ts"

test("rejects empty and oversized contract PDFs and sniffs %PDF magic bytes", () => {
  assert.equal(isContractSizeAllowed(0), false)
  assert.equal(isContractSizeAllowed(CONTRACT_MAX_BYTES), true)
  assert.equal(isContractSizeAllowed(CONTRACT_MAX_BYTES + 1), false)
  assert.equal(sniffContractMagicBytes(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d])), "pdf")
  assert.equal(sniffContractMagicBytes(Uint8Array.from([0xff, 0xd8, 0xff])), "unknown")
})

test("requires the exact key for the contract itself", () => {
  assert.equal(
    expectedContractObjectKey("tenant-1", "contract-1", "draft"),
    "tenants/tenant-1/contracts/contract-1-contract.pdf"
  )
  assert.equal(
    expectedContractObjectKey("tenant-1", "contract-1", "signed"),
    "tenants/tenant-1/contracts/contract-1-signed-contract.pdf"
  )
  assert.equal(
    isAllowedContractObjectKey(
      "tenants/tenant-1/contracts/contract-1-contract.pdf",
      "tenant-1",
      "contract-1",
      "draft"
    ),
    true
  )
  assert.equal(
    isAllowedContractObjectKey(
      "tenants/tenant-1/contracts/contract-1-signed-contract.pdf",
      "tenant-1",
      "contract-1",
      "draft"
    ),
    false
  )
  assert.equal(
    isAllowedContractObjectKey(
      "prod/tenants/tenant-1/contracts/contract-1-signed-contract.pdf",
      "tenant-1",
      "contract-1",
      "signed",
      "prod"
    ),
    true
  )
})

test("put object input signs content length and content type", () => {
  assert.deepEqual(
    contractPutObjectInput({
      bucket: "contracts",
      objectKey: "tenants/a/contracts/b-contract.pdf",
      contentType: "application/pdf",
      size: 2048,
    }),
    {
      Bucket: "contracts",
      Key: "tenants/a/contracts/b-contract.pdf",
      ContentType: "application/pdf",
      ContentLength: 2048,
    }
  )
})
