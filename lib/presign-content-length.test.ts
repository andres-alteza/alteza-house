import assert from "node:assert/strict"
import { test } from "node:test"
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { paymentProofPutObjectInput } from "./payment-proof-constraints.ts"

const fakeClient = new S3Client({
  region: "test-1",
  credentials: {
    accessKeyId: "FAKEACCESSKEYID",
    secretAccessKey: "fakesecretaccesskeyfakesecretaccesskey",
  },
})

const signingDate = new Date("2026-01-15T00:00:00.000Z")

async function signPaymentProofPresign(params: { size: number; contentType: string }) {
  const command = new PutObjectCommand(
    paymentProofPutObjectInput({
      bucket: "proofs-bucket",
      objectKey: "tenants/tenant-1/payments/2026/proof.jpg",
      contentType: params.contentType,
      size: params.size,
    })
  )

  return getSignedUrl(fakeClient, command, {
    expiresIn: 60 * 5,
    signingDate,
    signableHeaders: new Set(["content-length", "content-type"]),
  })
}

function signedHeaders(uploadUrl: string) {
  const signed = new URL(uploadUrl).searchParams.get("X-Amz-SignedHeaders") || ""
  return signed.split(";").filter(Boolean)
}

function signature(uploadUrl: string) {
  return new URL(uploadUrl).searchParams.get("X-Amz-Signature") || ""
}

test("payment proof presign signs content-length and content-type", async () => {
  const uploadUrl = await signPaymentProofPresign({
    size: 2048,
    contentType: "image/jpeg",
  })
  const headers = signedHeaders(uploadUrl)

  assert.ok(headers.includes("content-length"), uploadUrl)
  assert.ok(headers.includes("content-type"), uploadUrl)
})

test("a different content-length or content-type changes the presign signature", async () => {
  const jpeg2048 = await signPaymentProofPresign({
    size: 2048,
    contentType: "image/jpeg",
  })
  const jpeg4096 = await signPaymentProofPresign({
    size: 4096,
    contentType: "image/jpeg",
  })
  const png2048 = await signPaymentProofPresign({
    size: 2048,
    contentType: "image/png",
  })

  assert.notEqual(signature(jpeg2048), signature(jpeg4096))
  assert.notEqual(signature(jpeg2048), signature(png2048))
})
