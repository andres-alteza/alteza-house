import assert from "node:assert/strict"
import http from "node:http"
import { test } from "node:test"
import { S3Client } from "@aws-sdk/client-s3"
import { signUploadPut } from "./sign-upload-put.ts"
import { verifyContractPdfsBeforeSave } from "./save-contract-pdfs.ts"
import {
  EmptyOrMissingContractPdfError,
  InvalidContractPdfTypeError,
} from "./contract-pdf-constraints.ts"

type StoredObject = { body: Buffer; contentType: string }

function pdfBytes() {
  return Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n")
}

function jpegBytes() {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
}

function startMockS3() {
  const objects = new Map<string, StoredObject>()

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk) => chunks.push(chunk as Buffer))
    req.on("end", () => {
      const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`)
      const parts = url.pathname.replace(/^\/+/, "").split("/").map(decodeURIComponent)
      const bucket = parts[0] || ""
      const key = parts.slice(1).join("/")
      const id = `${bucket}/${key}`
      const body = Buffer.concat(chunks)

      if (req.method === "PUT") {
        objects.set(id, {
          body,
          contentType: String(req.headers["content-type"] || "application/octet-stream"),
        })
        res.writeHead(200)
        res.end()
        return
      }

      const stored = objects.get(id)
      if (!stored) {
        res.writeHead(404, { "content-type": "application/xml" })
        res.end("<Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>")
        return
      }

      if (req.method === "HEAD") {
        res.writeHead(200, {
          "content-type": stored.contentType,
          "content-length": String(stored.body.length),
        })
        res.end()
        return
      }

      if (req.method === "GET") {
        const range = req.headers.range
        let slice = stored.body
        let status = 200
        const headers: Record<string, string> = { "content-type": stored.contentType }
        if (typeof range === "string" && range.startsWith("bytes=")) {
          const [startRaw, endRaw] = range.slice(6).split("-")
          const start = Number(startRaw)
          const end = endRaw ? Number(endRaw) : stored.body.length - 1
          slice = stored.body.subarray(start, end + 1)
          status = 206
          headers["content-range"] = `bytes ${start}-${start + slice.length - 1}/${stored.body.length}`
        }
        headers["content-length"] = String(slice.length)
        res.writeHead(status, headers)
        res.end(slice)
        return
      }

      res.writeHead(405)
      res.end()
    })
  })

  return new Promise<{
    endpoint: string
    close: () => Promise<void>
  }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") throw new Error("mock S3 did not bind a port")
      resolve({
        endpoint: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => (error ? closeReject(error) : closeResolve()))
          }),
      })
    })
  })
}

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

test("local contract upload: presign, PUT, then update and sign against mock S3", async () => {
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

    const emptyKey = `tenants/${tenantId}/contracts/${contractId}-contract.pdf`
    await putSignedObject({
      client,
      bucket,
      objectKey: emptyKey,
      body: Buffer.alloc(0),
      contentType: "application/pdf",
    })
    await assert.rejects(
      () =>
        verifyContractPdfsBeforeSave({
          existingTenantId: tenantId,
          contractId,
          pdfUrl: emptyKey,
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
