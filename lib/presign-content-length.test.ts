import assert from "node:assert/strict"
import { test } from "node:test"
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { putObjectInput } from "./upload-object-constraints.ts"
import { SIGNABLE_PUT_HEADERS, signUploadPut } from "./sign-upload-put.ts"

const fakeClient = new S3Client({
  region: "test-1",
  credentials: {
    accessKeyId: "FAKEACCESSKEYID",
    secretAccessKey: "fakesecretaccesskeyfakesecretaccesskey",
  },
})

const signingDate = new Date("2026-01-15T00:00:00.000Z")

function signedHeaders(uploadUrl: string) {
  const signed = new URL(uploadUrl).searchParams.get("X-Amz-SignedHeaders") || ""
  return signed.split(";").filter(Boolean)
}

function signature(uploadUrl: string) {
  return new URL(uploadUrl).searchParams.get("X-Amz-Signature") || ""
}

function signPayment(params: { size: number; contentType: string }) {
  return signUploadPut(fakeClient, {
    bucket: "proofs-bucket",
    objectKey: "tenants/tenant-1/payments/2026/proof.jpg",
    contentType: params.contentType,
    size: params.size,
    signingDate,
  })
}

function signContract(params: { size: number; contentType: string }) {
  return signUploadPut(fakeClient, {
    bucket: "contracts-bucket",
    objectKey: "tenants/tenant-1/contracts/contract-1-signed-contract.pdf",
    contentType: params.contentType,
    size: params.size,
    signingDate,
  })
}

test("signUploadPut requires content-length and content-type in SIGNABLE_PUT_HEADERS", () => {
  assert.deepEqual([...SIGNABLE_PUT_HEADERS], ["content-length", "content-type"])
})

test("payment proof presign signs content-length and content-type", async () => {
  const uploadUrl = await signPayment({
    size: 2048,
    contentType: "image/jpeg",
  })
  const headers = signedHeaders(uploadUrl)

  assert.ok(headers.includes("content-length"), uploadUrl)
  assert.ok(headers.includes("content-type"), uploadUrl)
})

test("contract PDF presign signs content-length and content-type through the same helper", async () => {
  const uploadUrl = await signContract({
    size: 4096,
    contentType: "application/pdf",
  })
  const headers = signedHeaders(uploadUrl)

  assert.ok(headers.includes("content-length"), uploadUrl)
  assert.ok(headers.includes("content-type"), uploadUrl)
})

test("skipping signUploadPut leaves content-type unsigned", async () => {
  const uploadUrl = await getSignedUrl(
    fakeClient,
    new PutObjectCommand(
      putObjectInput({
        bucket: "contracts-bucket",
        objectKey: "tenants/tenant-1/contracts/contract-1-contract.pdf",
        contentType: "application/pdf",
        size: 4096,
      })
    ),
    { expiresIn: 60 * 5, signingDate }
  )
  const headers = signedHeaders(uploadUrl)

  assert.equal(headers.includes("content-type"), false)
})

test("a different content-length or content-type changes the presign signature", async () => {
  const jpeg2048 = await signPayment({
    size: 2048,
    contentType: "image/jpeg",
  })
  const jpeg4096 = await signPayment({
    size: 4096,
    contentType: "image/jpeg",
  })
  const png2048 = await signPayment({
    size: 2048,
    contentType: "image/png",
  })

  assert.notEqual(signature(jpeg2048), signature(jpeg4096))
  assert.notEqual(signature(jpeg2048), signature(png2048))
})
