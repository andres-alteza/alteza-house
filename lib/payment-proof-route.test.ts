import assert from "node:assert/strict"
import { createHash, randomBytes } from "node:crypto"
import { test } from "node:test"
import { ObjectId } from "mongodb"
import { NextRequest } from "next/server"
import type { AuthenticatedUser } from "./api-auth"
import { setAuthenticateRequestForTests } from "./api-auth"
import { setCollectionGetterForTests } from "./mongodb"
import { jpegBytes, pdfBytes, startMockS3 } from "./mock-s3-server"
import { PROOF_ROUTE_MAX_BYTES } from "./payment-proof-access"
import { getS3Client, resetS3Client } from "./s3"
import { GET as proofGet, HEAD as proofHead } from "../app/api/payments/[id]/proof/route"
import { GET as proofUrlGet } from "../app/api/payments/[id]/proof-url/route"

type Doc = Record<string, unknown> & { _id: ObjectId }

const BUCKET = "local-proofs"
const admin: AuthenticatedUser = { uid: "admin-1", email: "admin@test.local", role: "admin" }
const owner: AuthenticatedUser = { uid: "tenant-1", email: "owner@test.local", role: "tenant" }
const other: AuthenticatedUser = { uid: "tenant-2", email: "other@test.local", role: "tenant" }

function paymentsCollection(docs: Doc[]) {
  return {
    async findOne(query: { _id: ObjectId }) {
      return docs.find((doc) => doc._id.toString() === String(query._id)) ?? null
    },
  }
}

async function setup(t: { after: (fn: () => Promise<void>) => void }) {
  const mockS3 = await startMockS3()
  const tenantId = new ObjectId().toString()
  const state = { user: admin as AuthenticatedUser | null }
  const docs: Doc[] = []

  delete process.env.S3_PREFIX
  process.env.AWS_REGION = "test-1"
  process.env.S3_BUCKET = BUCKET
  process.env.S3_ENDPOINT = mockS3.endpoint
  process.env.AWS_ACCESS_KEY_ID = "test"
  process.env.AWS_SECRET_ACCESS_KEY = "testsecret"
  resetS3Client()

  setAuthenticateRequestForTests(async () =>
    state.user ? { user: state.user } : { error: Response.json({ error: "No token provided" }, { status: 401 }) as never }
  )
  setCollectionGetterForTests(async (name: string) => {
    if (name === "payments") return paymentsCollection(docs) as never
    throw new Error(`Unexpected collection ${name}`)
  })

  t.after(async () => {
    setAuthenticateRequestForTests(null)
    setCollectionGetterForTests(null)
    resetS3Client()
    delete process.env.S3_ENDPOINT
    await mockS3.close()
  })

  let n = 0
  async function addPayment(file: { body: Buffer; contentType: string; recordedType?: string; skipUpload?: boolean }) {
    n += 1
    const objectKey = `tenants/${tenantId}/payments/2026/p${n}-11-abcd1234-proof.bin`
    if (!file.skipUpload) {
      const res = await fetch(`${mockS3.endpoint}/${BUCKET}/${objectKey}`, {
        method: "PUT",
        headers: { "Content-Type": file.contentType },
        body: new Uint8Array(file.body),
      })
      assert.equal(res.ok, true)
    }
    const _id = new ObjectId()
    docs.push({
      _id,
      tenantId,
      tenantEmail: owner.email,
      proofAttachments: [
        { objectKey, filename: "proof.bin", contentType: file.recordedType ?? file.contentType, size: file.body.length },
      ],
    })
    return { id: _id.toString(), objectKey }
  }

  return { state, docs, tenantId, addPayment }
}

function req(path: string, method = "GET", headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, { method, headers: { authorization: "Bearer t", ...headers } })
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const sha = (b: Uint8Array | Buffer) => createHash("sha256").update(b).digest("hex")

test("proof route: auth and lookup errors match proof-url", async (t) => {
  const { state, docs, addPayment } = await setup(t)
  const { id, objectKey } = await addPayment({ body: jpegBytes(), contentType: "image/jpeg" })
  const url = `/api/payments/${id}/proof`

  state.user = null
  assert.equal((await proofGet(req(url), ctx(id))).status, 401)
  assert.equal((await proofHead(req(url, "HEAD"), ctx(id))).status, 401)

  for (const user of [owner, other]) {
    state.user = user
    assert.equal((await proofGet(req(url), ctx(id))).status, 403, "admin only: even the owner is refused")
    assert.equal((await proofHead(req(url, "HEAD"), ctx(id))).status, 403)
  }

  state.user = admin
  assert.equal((await proofGet(req("/x"), ctx("not-an-id"))).status, 400)
  const unknown = new ObjectId().toString()
  assert.equal((await proofGet(req(`/api/payments/${unknown}/proof`), ctx(unknown))).status, 404)
  assert.equal((await proofGet(req(`${url}?objectKey=${encodeURIComponent(objectKey + "x")}`), ctx(id))).status, 404)
  assert.equal((await proofGet(req(`${url}?objectKey=${encodeURIComponent("../etc/passwd")}`), ctx(id))).status, 400)

  const noProof = new ObjectId()
  docs.push({ _id: noProof, tenantId: "t", tenantEmail: "x@test.local" })
  assert.equal((await proofGet(req("/x"), ctx(noProof.toString()))).status, 404)

  const foreignKey = new ObjectId()
  docs.push({
    _id: foreignKey,
    tenantId: "someone",
    tenantEmail: "x@test.local",
    proofAttachments: [{ objectKey: "tenants/other-tenant/payments/2026/a.jpg", filename: "a.jpg", contentType: "image/jpeg" }],
  })
  const foreign = await proofGet(req("/x"), ctx(foreignKey.toString()))
  assert.equal(foreign.status, 400)
  assert.equal(((await foreign.json()) as { code: string }).code, "invalid_proof_key")
})

test("proof route: admin GET returns exact bytes for jpeg and pdf with safe headers", async (t) => {
  const { addPayment } = await setup(t)
  for (const [body, type] of [
    [jpegBytes(), "image/jpeg"],
    [pdfBytes(), "application/pdf"],
  ] as const) {
    const { id } = await addPayment({ body, contentType: type })
    const res = await proofGet(req(`/api/payments/${id}/proof`), ctx(id))
    assert.equal(res.status, 200)
    assert.equal(res.headers.get("content-type"), type)
    assert.equal(res.headers.get("cache-control"), "private, no-store")
    assert.equal(res.headers.get("accept-ranges"), "bytes")
    assert.equal(res.headers.get("content-length"), String(body.length))
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), body)
  }
})

test("proof route: Range returns 206 with Content-Range and the exact bytes", async (t) => {
  const { addPayment } = await setup(t)
  const body = randomBytes(1000)
  const { id } = await addPayment({ body, contentType: "image/png" })
  const res = await proofGet(req(`/api/payments/${id}/proof`, "GET", { range: "bytes=100-299" }), ctx(id))
  assert.equal(res.status, 206)
  assert.equal(res.headers.get("content-range"), "bytes 100-299/1000")
  assert.equal(res.headers.get("accept-ranges"), "bytes")
  assert.equal(res.headers.get("content-length"), "200")
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), body.subarray(100, 300))

  const bad = await proofGet(req(`/api/payments/${id}/proof`, "GET", { range: "bytes=0-1,5-9" }), ctx(id))
  assert.equal(bad.status, 416)
})

test("proof route: a file over 4.4 MB is 413 without Range and is rebuilt exactly from 4 MB chunks", async (t) => {
  const { addPayment } = await setup(t)
  const body = randomBytes(9_000_000)
  const { id } = await addPayment({ body, contentType: "image/jpeg" })
  const url = `/api/payments/${id}/proof`

  const whole = await proofGet(req(url), ctx(id))
  assert.equal(whole.status, 413)
  const info = (await whole.json()) as { code: string; size: number; maxBytes: number }
  assert.equal(info.code, "too_large_for_route")
  assert.equal(info.size, body.length)
  assert.equal(info.maxBytes, PROOF_ROUTE_MAX_BYTES)

  const open = await proofGet(req(url, "GET", { range: "bytes=0-" }), ctx(id))
  assert.equal(open.status, 413, "an open-ended range over the cap is also refused")

  const head = await proofHead(req(url, "HEAD"), ctx(id))
  assert.equal(head.status, 200)
  const total = Number(head.headers.get("x-proof-size"))
  assert.equal(total, body.length)

  const chunk = 4 * 1024 * 1024
  const parts: Buffer[] = []
  for (let start = 0; start < total; start += chunk) {
    const end = Math.min(start + chunk, total) - 1
    const res = await proofGet(req(url, "GET", { range: `bytes=${start}-${end}` }), ctx(id))
    assert.equal(res.status, 206)
    assert.equal(res.headers.get("content-range"), `bytes ${start}-${end}/${total}`)
    parts.push(Buffer.from(await res.arrayBuffer()))
  }
  const rebuilt = Buffer.concat(parts)
  assert.equal(rebuilt.length, body.length)
  assert.equal(sha(rebuilt), sha(body))
})

test("proof route: HEAD sends the real size in X-Proof-Size and no body", async (t) => {
  const { addPayment } = await setup(t)
  const body = randomBytes(1234)
  const { id } = await addPayment({ body, contentType: "image/jpeg" })
  const res = await proofHead(req(`/api/payments/${id}/proof`, "HEAD"), ctx(id))
  assert.equal(res.status, 200)
  assert.equal(res.headers.get("x-proof-size"), "1234")
  assert.equal(res.headers.get("cache-control"), "private, no-store")
  assert.equal(res.headers.get("content-type"), "image/jpeg")
  assert.equal((await res.arrayBuffer()).byteLength, 0)
})

test("proof route: a stored content type that is not an allowed proof type is sent as octet-stream", async (t) => {
  const { addPayment } = await setup(t)
  const { id } = await addPayment({ body: Buffer.from("<script>alert(1)</script>"), contentType: "text/html", recordedType: "image/jpeg" })
  const res = await proofGet(req(`/api/payments/${id}/proof`), ctx(id))
  assert.equal(res.status, 200)
  assert.equal(res.headers.get("content-type"), "application/octet-stream")
  assert.equal(res.headers.get("x-content-type-options"), "nosniff")
  const head = await proofHead(req(`/api/payments/${id}/proof`, "HEAD"), ctx(id))
  assert.equal(head.headers.get("content-type"), "application/octet-stream")
})

test("proof route: a missing or empty S3 object is 400 empty_proof (HEAD names the reason in X-Proof-Error)", async (t) => {
  const { addPayment } = await setup(t)
  const missing = await addPayment({ body: jpegBytes(), contentType: "image/jpeg", skipUpload: true })
  const empty = await addPayment({ body: Buffer.alloc(0), contentType: "image/jpeg" })
  for (const [{ id }, reason] of [
    [missing, "missing_proof"],
    [empty, "empty_proof"],
  ] as const) {
    const res = await proofGet(req(`/api/payments/${id}/proof`), ctx(id))
    assert.equal(res.status, 400)
    assert.equal(((await res.json()) as { code: string }).code, "empty_proof")
    const head = await proofHead(req(`/api/payments/${id}/proof`, "HEAD"), ctx(id))
    assert.equal(head.status, 400)
    assert.equal(head.headers.get("x-proof-error"), reason)
  }
})

test("proof route: an S3 403 AccessDenied is treated as missing, like proof-url", async (t) => {
  const { addPayment } = await setup(t)
  const { id } = await addPayment({ body: jpegBytes(), contentType: "image/jpeg" })
  const denied = Object.assign(new Error("Access Denied"), { name: "AccessDenied", $metadata: { httpStatusCode: 403 } })
  getS3Client().send = (async () => {
    throw denied
  }) as never

  const res = await proofGet(req(`/api/payments/${id}/proof`), ctx(id))
  assert.equal(res.status, 400)
  assert.equal(((await res.json()) as { code: string }).code, "empty_proof")

  const head = await proofHead(req(`/api/payments/${id}/proof`, "HEAD"), ctx(id))
  assert.equal(head.status, 400)
  assert.equal(head.headers.get("x-proof-error"), "missing_proof")
})

test("proof-url keeps allowing the owner and refusing another tenant, with the same response shape", async (t) => {
  const { state, addPayment } = await setup(t)
  const { id, objectKey } = await addPayment({ body: jpegBytes(), contentType: "image/jpeg" })
  const url = `/api/payments/${id}/proof-url`

  state.user = owner
  const ok = await proofUrlGet(req(url), ctx(id))
  assert.equal(ok.status, 200)
  const body = (await ok.json()) as Record<string, unknown>
  assert.deepEqual(Object.keys(body).sort(), ["contentType", "filename", "objectKey", "size", "url"])
  assert.equal(body.objectKey, objectKey)
  assert.equal(body.filename, "proof.bin")
  assert.equal(body.contentType, "image/jpeg")
  assert.equal(body.size, jpegBytes().length)
  assert.match(String(body.url), /X-Amz-Signature=/)

  state.user = other
  assert.equal((await proofUrlGet(req(url), ctx(id))).status, 403)

  state.user = admin
  assert.equal((await proofUrlGet(req(url), ctx(id))).status, 200)

  state.user = null
  assert.equal((await proofUrlGet(req(url), ctx(id))).status, 401)
})
