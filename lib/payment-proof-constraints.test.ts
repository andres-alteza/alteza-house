import assert from "node:assert/strict"
import { test } from "node:test"
import {
  PAYMENT_PROOF_MAX_BYTES,
  claimedProofTypeMatchesMagic,
  getProofFileIssue,
  inferProofContentType,
  isAllowedProofContentType,
  isAllowedProofObjectKey,
  isProofSizeAllowed,
  paymentProofPutObjectInput,
  sniffProofMagicBytes,
} from "./payment-proof-constraints.ts"

test("allows Android and iPhone content types including HEIC/HEIF", () => {
  for (const contentType of [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/heic-sequence",
    "IMAGE/HEIF",
    "application/pdf",
  ]) {
    assert.equal(isAllowedProofContentType(contentType), true, contentType)
  }
  assert.equal(isAllowedProofContentType("text/plain"), false)
  assert.equal(isAllowedProofContentType(""), false)
  assert.equal(isAllowedProofContentType("image/svg+xml"), false)
  assert.equal(isAllowedProofContentType("image/foo"), false)
})

test("infers jpeg from WhatsApp-style filenames when the picker omits a type", () => {
  assert.equal(inferProofContentType("IMG-20260318-WA0004.jpg", ""), "image/jpeg")
  assert.equal(inferProofContentType("photo.HEIC", ""), "image/heic")
  assert.equal(inferProofContentType("scan.PDF", "application/octet-stream"), "application/pdf")
})

test("rejects empty and oversized files", () => {
  assert.equal(isProofSizeAllowed(0), false)
  assert.equal(isProofSizeAllowed(PAYMENT_PROOF_MAX_BYTES), true)
  assert.equal(isProofSizeAllowed(PAYMENT_PROOF_MAX_BYTES + 1), false)
  assert.equal(getProofFileIssue({ name: "a.jpg", type: "image/jpeg", size: 0 }), "empty")
  assert.equal(
    getProofFileIssue({ name: "a.jpg", type: "image/jpeg", size: PAYMENT_PROOF_MAX_BYTES + 1 }),
    "too-large"
  )
  assert.equal(getProofFileIssue({ name: "a.jpg", type: "image/jpeg", size: 12 }), null)
})

test("sniffs jpeg, png, pdf, heic/heif, webp, gif, avif, and bmp magic bytes", () => {
  assert.equal(sniffProofMagicBytes(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), "jpeg")
  assert.equal(
    sniffProofMagicBytes(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    "png"
  )
  assert.equal(sniffProofMagicBytes(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d])), "pdf")

  const heic = new Uint8Array(24)
  heic.set([0x00, 0x00, 0x00, 0x18], 0)
  heic.set(Uint8Array.from(Buffer.from("ftypheic")), 4)
  assert.equal(sniffProofMagicBytes(heic), "heic")

  const mif1 = new Uint8Array(24)
  mif1.set(Uint8Array.from(Buffer.from("ftypmif1")), 4)
  mif1.set(Uint8Array.from(Buffer.from("heic")), 16)
  assert.equal(sniffProofMagicBytes(mif1), "heic")

  const webp = new Uint8Array(12)
  webp.set(Uint8Array.from(Buffer.from("RIFF")), 0)
  webp.set(Uint8Array.from(Buffer.from("WEBP")), 8)
  assert.equal(sniffProofMagicBytes(webp), "webp")

  assert.equal(sniffProofMagicBytes(Uint8Array.from(Buffer.from("GIF89a"))), "gif")
  assert.equal(sniffProofMagicBytes(Uint8Array.from([0x42, 0x4d, 0x00, 0x00])), "bmp")

  const avif = new Uint8Array(24)
  avif.set(Uint8Array.from(Buffer.from("ftypavif")), 4)
  assert.equal(sniffProofMagicBytes(avif), "avif")

  assert.equal(sniffProofMagicBytes(new Uint8Array()), "unknown")
  assert.equal(claimedProofTypeMatchesMagic("image/jpeg", "jpeg"), true)
  assert.equal(claimedProofTypeMatchesMagic("image/jpeg", "png"), false)
  assert.equal(claimedProofTypeMatchesMagic("image/webp", "webp"), true)
  assert.equal(claimedProofTypeMatchesMagic("image/webp", "jpeg"), false)
})

test("rejects keys from another tenant, contract keys, traversal, and URLs", () => {
  assert.equal(
    isAllowedProofObjectKey("tenants/tenant-1/payments/2026/proof.jpg", "tenant-1"),
    true
  )
  assert.equal(
    isAllowedProofObjectKey("tenants/other-tenant/payments/2026/proof.jpg", "tenant-1"),
    false
  )
  assert.equal(
    isAllowedProofObjectKey("tenants/tenant-1/contracts/abc-contract.pdf", "tenant-1"),
    false
  )
  assert.equal(
    isAllowedProofObjectKey("../tenants/tenant-1/payments/proof.jpg", "tenant-1"),
    false
  )
  assert.equal(
    isAllowedProofObjectKey("/tenants/tenant-1/payments/proof.jpg", "tenant-1"),
    false
  )
  assert.equal(
    isAllowedProofObjectKey(
      "https://bucket.s3.amazonaws.com/tenants/tenant-1/payments/proof.jpg",
      "tenant-1"
    ),
    false
  )
  assert.equal(
    isAllowedProofObjectKey("prod/tenants/tenant-1/payments/proof.jpg", "tenant-1", "prod"),
    true
  )
})

test("put object input signs content length and content type", () => {
  assert.deepEqual(
    paymentProofPutObjectInput({
      bucket: "proofs",
      objectKey: "tenants/a/payments/x.jpg",
      contentType: "image/jpeg",
      size: 2048,
    }),
    {
      Bucket: "proofs",
      Key: "tenants/a/payments/x.jpg",
      ContentType: "image/jpeg",
      ContentLength: 2048,
    }
  )
})
