import assert from "node:assert/strict"
import { test } from "node:test"
import { destinationTenantId, verifyContractPdfsBeforeSave } from "./save-contract-pdfs.ts"
import { InvalidContractPdfKeyError } from "./contract-pdf-constraints.ts"

function pdfPrefix() {
  return Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
}

function mockSend(objects: Record<string, { size: number; contentType: string; bytes?: Uint8Array }>) {
  return async (command: unknown) => {
    const key = (command as { input?: { Key?: string } }).input?.Key || ""
    const object = objects[key]
    if (!object) {
      const error = Object.assign(new Error("NotFound"), {
        name: "NotFound",
        $metadata: { httpStatusCode: 404 },
      })
      throw error
    }
    return {
      ContentLength: object.size,
      ContentType: object.contentType,
      Body: object.bytes || pdfPrefix(),
    }
  }
}

test("destinationTenantId uses the requested tenant when present", () => {
  assert.equal(destinationTenantId("tenant-1", "tenant-2"), "tenant-2")
  assert.equal(destinationTenantId("tenant-1", "  "), "tenant-1")
  assert.equal(destinationTenantId("tenant-1"), "tenant-1")
})

test("a tenant change with a new pdfUrl is checked against the new tenant", async () => {
  const newKey = "tenants/tenant-2/contracts/contract-1-contract.pdf"
  const oldKey = "tenants/tenant-1/contracts/contract-1-contract.pdf"
  const send = mockSend({
    [newKey]: { size: 1200, contentType: "application/pdf" },
    [oldKey]: { size: 1200, contentType: "application/pdf" },
  })

  const saved = await verifyContractPdfsBeforeSave({
    existingTenantId: "tenant-1",
    requestedTenantId: "tenant-2",
    contractId: "contract-1",
    pdfUrl: newKey,
    send,
    bucket: "contracts",
    s3Prefix: "",
  })
  assert.equal(saved.tenantId, "tenant-2")
  assert.equal(saved.pdfUrl, newKey)

  await assert.rejects(
    () =>
      verifyContractPdfsBeforeSave({
        existingTenantId: "tenant-1",
        requestedTenantId: "tenant-2",
        contractId: "contract-1",
        pdfUrl: oldKey,
        send,
        bucket: "contracts",
        s3Prefix: "",
      }),
    InvalidContractPdfKeyError
  )
})
