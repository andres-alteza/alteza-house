import assert from "node:assert/strict"
import { test } from "node:test"
import { S3Client } from "@aws-sdk/client-s3"
import { signPaymentProofPut } from "./sign-payment-proof-put.ts"

const fakeClient = new S3Client({
  region: "test-1",
  credentials: {
    accessKeyId: "FAKEACCESSKEYID",
    secretAccessKey: "fakesecretaccesskeyfakesecretaccesskey",
  },
})

const signingDate = new Date("2026-01-15T00:00:00.000Z")

function sign(params: { size: number; contentType: string }) {
  return signPaymentProofPut(fakeClient, {
    bucket: "proofs-bucket",
    objectKey: "tenants/tenant-1/payments/2026/proof.jpg",
    contentType: params.contentType,
    size: params.size,
    signingDate,
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
  const uploadUrl = await sign({
    size: 2048,
    contentType: "image/jpeg",
  })
  const headers = signedHeaders(uploadUrl)

  assert.ok(headers.includes("content-length"), uploadUrl)
  assert.ok(headers.includes("content-type"), uploadUrl)
})

test("a different content-length or content-type changes the presign signature", async () => {
  const jpeg2048 = await sign({
    size: 2048,
    contentType: "image/jpeg",
  })
  const jpeg4096 = await sign({
    size: 4096,
    contentType: "image/jpeg",
  })
  const png2048 = await sign({
    size: 2048,
    contentType: "image/png",
  })

  assert.notEqual(signature(jpeg2048), signature(jpeg4096))
  assert.notEqual(signature(jpeg2048), signature(png2048))
})
