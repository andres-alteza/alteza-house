import assert from "node:assert/strict"
import { test } from "node:test"
import { S3Client } from "@aws-sdk/client-s3"
import { signUploadPut } from "./sign-upload-put.ts"
import { verifyContractPdfsBeforeSave } from "./save-contract-pdfs.ts"
import {
  EmptyOrMissingContractPdfError,
  InvalidContractPdfTypeError,
} from "./contract-pdf-constraints.ts"
import { jpegBytes, pdfBytes, startMockS3 } from "./mock-s3-server.ts"

function localS3Client(endpoint: string) {
  return new S3Client({
    region: "test-1",
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: "test",
      secretAccessKey: "testsecret",
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  })
}

async function putSignedObject(params: {
  client: S3Client
  bucket: string
  objectKey: string
  body: Buffer
  contentType: string
}) {
  const uploadUrl = await signUploadPut(params.client, {
    bucket: params.bucket,
    objectKey: params.objectKey,
    contentType: params.contentType,
    size: params.body.length,
  })
  const signed = new URL(uploadUrl).searchParams.get("X-Amz-SignedHeaders") || ""
  assert.ok(signed.split(";").includes("content-length"), uploadUrl)
  assert.ok(signed.split(";").includes("content-type"), uploadUrl)

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": params.contentType },
    body: new Uint8Array(params.body),
  })
  assert.equal(response.ok, true, await response.text())
}

test("helper contract upload: presign helper, PUT, then save helpers against mock S3", async () => {
  const mock = await startMockS3()
  const bucket = "local-contracts"
  const client = localS3Client(mock.endpoint)
  const send = (command: unknown) => client.send(command as never)
  const tenantId = "tenant-1"
  const contractId = "contract-1"
  const draftKey = `tenants/${tenantId}/contracts/${contractId}-contract.pdf`
  const signedKey = `tenants/${tenantId}/contracts/${contractId}-signed-contract.pdf`

  try {
    await putSignedObject({
      client,
      bucket,
      objectKey: draftKey,
      body: pdfBytes(),
      contentType: "application/pdf",
    })
    const updated = await verifyContractPdfsBeforeSave({
      existingTenantId: tenantId,
      contractId,
      pdfUrl: draftKey,
      send,
      bucket,
      s3Prefix: "",
    })
    assert.equal(updated.pdfUrl, draftKey)

    await putSignedObject({
      client,
      bucket,
      objectKey: signedKey,
      body: pdfBytes(),
      contentType: "application/pdf",
    })
    const signed = await verifyContractPdfsBeforeSave({
      existingTenantId: tenantId,
      contractId,
      signedPdfUrl: signedKey,
      send,
      bucket,
      s3Prefix: "",
    })
    assert.equal(signed.signedPdfUrl, signedKey)

    await putSignedObject({
      client,
      bucket,
      objectKey: draftKey,
      body: Buffer.alloc(0),
      contentType: "application/pdf",
    })
    await assert.rejects(
      () =>
        verifyContractPdfsBeforeSave({
          existingTenantId: tenantId,
          contractId,
          pdfUrl: draftKey,
          send,
          bucket,
          s3Prefix: "",
        }),
      EmptyOrMissingContractPdfError
    )

    await putSignedObject({
      client,
      bucket,
      objectKey: draftKey,
      body: jpegBytes(),
      contentType: "application/pdf",
    })
    await assert.rejects(
      () =>
        verifyContractPdfsBeforeSave({
          existingTenantId: tenantId,
          contractId,
          pdfUrl: draftKey,
          send,
          bucket,
          s3Prefix: "",
        }),
      InvalidContractPdfTypeError
    )
  } finally {
    client.destroy()
    await mock.close()
  }
})
