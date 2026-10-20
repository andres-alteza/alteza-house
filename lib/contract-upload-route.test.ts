import assert from "node:assert/strict"
import { test } from "node:test"
import { ObjectId } from "mongodb"
import { NextRequest } from "next/server"
import type { AuthenticatedUser } from "./api-auth.ts"
import { setAuthenticateRequestForTests } from "./api-auth.ts"
import { setCollectionGetterForTests } from "./mongodb.ts"
import { jpegBytes, pdfBytes, startMockS3 } from "./mock-s3-server.ts"
import { resetS3Client } from "./s3.ts"
import { POST as presignContract } from "../app/api/uploads/contract/presign/route.ts"
import { PUT as updateContract } from "../app/api/contracts/[id]/route.ts"
import { POST as signContract } from "../app/api/contracts/[id]/sign/route.ts"

type MemoryDoc = Record<string, unknown> & { _id: ObjectId }

function matches(doc: MemoryDoc, query: Record<string, unknown> | undefined) {
  if (!query) return true
  for (const [key, value] of Object.entries(query)) {
    if (key === "_id") {
      if (value && typeof value === "object" && "$ne" in (value as object)) {
        if (doc._id.toString() === String((value as { $ne: unknown }).$ne)) return false
      } else if (doc._id.toString() !== String(value)) {
        return false
      }
      continue
    }
    if (key === "status" && value && typeof value === "object" && "$in" in (value as object)) {
      if (!(value as { $in: unknown[] }).$in.includes(doc.status)) return false
      continue
    }
    if (key === "startDate" && value && typeof value === "object" && "$lte" in (value as object)) {
      if (!(String(doc.startDate) <= String((value as { $lte: unknown }).$lte))) return false
      continue
    }
    if (key === "endDate" && value && typeof value === "object" && "$gte" in (value as object)) {
      if (!(String(doc.endDate) >= String((value as { $gte: unknown }).$gte))) return false
      continue
    }
    if (doc[key] !== value) return false
  }
  return true
}

function memoryCollection(docs: MemoryDoc[]) {
  return {
    async findOne(query: Record<string, unknown>) {
      return docs.find((doc) => matches(doc, query)) ?? null
    },
    async findOneAndUpdate(query: Record<string, unknown>, update: { $set?: Record<string, unknown> }) {
      const doc = docs.find((item) => matches(item, query))
      if (!doc) return null
      Object.assign(doc, update.$set || {})
      return doc
    },
  }
}

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token",
    },
    body: JSON.stringify(body),
  })
}

function signedHeaders(uploadUrl: string) {
  return (new URL(uploadUrl).searchParams.get("X-Amz-SignedHeaders") || "").split(";").filter(Boolean)
}

test("route-level contract upload: presign, PUT to mock S3, then update and sign", async (t) => {
  const prefix = "stage"
  const bucket = "local-contracts"
  const mockS3 = await startMockS3()
  const tenantObjectId = new ObjectId()
  const contractObjectId = new ObjectId()
  const tenantId = tenantObjectId.toString()
  const contractId = contractObjectId.toString()
  const admin: AuthenticatedUser = { uid: "admin-1", email: "admin@test.local", role: "admin" }
  const tenantUser: AuthenticatedUser = { uid: "tenant-1", email: "tenant@test.local", role: "tenant" }
  let currentUser = admin

  const tenants = [
    {
      _id: tenantObjectId,
      email: tenantUser.email,
      name: "Test Tenant",
    },
  ]
  const contracts: MemoryDoc[] = [
    {
      _id: contractObjectId,
      tenantId,
      tenantName: "Test Tenant",
      startDate: "2026-01-01",
      endDate: "2026-06-30",
      monthlyPrice: 100,
      status: "ready_to_sign",
      pdfUrl: "",
      signedPdfUrl: "",
    },
  ]

  process.env.AWS_REGION = "test-1"
  process.env.S3_BUCKET = bucket
  process.env.S3_PREFIX = prefix
  process.env.S3_ENDPOINT = mockS3.endpoint
  process.env.AWS_ACCESS_KEY_ID = "test"
  process.env.AWS_SECRET_ACCESS_KEY = "testsecret"
  resetS3Client()

  setAuthenticateRequestForTests(async () => ({ user: currentUser }))
  setCollectionGetterForTests(async (name: string) => {
    if (name === "tenants") return memoryCollection(tenants as MemoryDoc[]) as never
    if (name === "contracts") return memoryCollection(contracts) as never
    throw new Error(`Unexpected collection ${name}`)
  })

  t.after(async () => {
    setAuthenticateRequestForTests(null)
    setCollectionGetterForTests(null)
    resetS3Client()
    delete process.env.S3_ENDPOINT
    await mockS3.close()
  })

  const params = { params: Promise.resolve({ id: contractId }) }

  async function presignAndPut(kind: "draft" | "signed", body: Buffer) {
    const presignResponse = await presignContract(
      jsonRequest("http://localhost/api/uploads/contract/presign", {
        contractId,
        filename: kind === "signed" ? "signed.pdf" : "draft.pdf",
        contentType: "application/pdf",
        size: body.length || 12,
        kind,
      })
    )
    assert.equal(presignResponse.status, 200, await presignResponse.clone().text())
    const presign = (await presignResponse.json()) as { uploadUrl: string; objectKey: string }
    const headers = signedHeaders(presign.uploadUrl)
    assert.ok(headers.includes("content-length"), presign.uploadUrl)
    assert.ok(headers.includes("content-type"), presign.uploadUrl)
    assert.match(presign.objectKey, new RegExp(`^${prefix}/tenants/${tenantId}/contracts/${contractId}-`))

    const putResponse = await fetch(presign.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: new Uint8Array(body),
    })
    assert.equal(putResponse.ok, true, await putResponse.text())
    return presign
  }

  currentUser = admin
  const emptyPresign = await presignContract(
    jsonRequest("http://localhost/api/uploads/contract/presign", {
      contractId,
      filename: "empty.pdf",
      contentType: "application/pdf",
      size: 0,
      kind: "draft",
    })
  )
  assert.equal(emptyPresign.status, 400)

  const draft = await presignAndPut("draft", pdfBytes())
  const savedDraft = await updateContract(
    jsonRequest(`http://localhost/api/contracts/${contractId}`, { pdfUrl: draft.objectKey }),
    params
  )
  assert.equal(savedDraft.status, 200, await savedDraft.clone().text())
  const savedDraftBody = (await savedDraft.json()) as { pdfUrl: string }
  assert.equal(savedDraftBody.pdfUrl, draft.objectKey)

  const emptyObject = await presignAndPut("draft", Buffer.alloc(0))
  const emptySave = await updateContract(
    jsonRequest(`http://localhost/api/contracts/${contractId}`, { pdfUrl: emptyObject.objectKey }),
    params
  )
  assert.equal(emptySave.status, 400)
  const emptyBody = (await emptySave.json()) as { code?: string }
  assert.equal(emptyBody.code, "empty_contract")

  const fakePdf = await presignAndPut("draft", jpegBytes())
  const fakeSave = await updateContract(
    jsonRequest(`http://localhost/api/contracts/${contractId}`, { pdfUrl: fakePdf.objectKey }),
    params
  )
  assert.equal(fakeSave.status, 400)
  const fakeBody = (await fakeSave.json()) as { code?: string }
  assert.equal(fakeBody.code, "invalid_contract_type")

  await presignAndPut("draft", pdfBytes())
  currentUser = tenantUser
  const signed = await presignAndPut("signed", pdfBytes())
  const signedSave = await signContract(
    jsonRequest(`http://localhost/api/contracts/${contractId}/sign`, { signedPdfUrl: signed.objectKey }),
    params
  )
  assert.equal(signedSave.status, 200, await signedSave.clone().text())
  const signedBody = (await signedSave.json()) as { signedPdfUrl?: string; status: string }
  assert.equal(signedBody.signedPdfUrl, signed.objectKey)
  assert.equal(signedBody.status, "signed")
})
