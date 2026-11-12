import { NextRequest, NextResponse } from "next/server"
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"
import { withAuth } from "@/lib/api-auth"
import { PROOF_ROUTE_MAX_BYTES, resolvePaymentProof } from "@/lib/payment-proof-access"
import { isS3NotFound } from "@/lib/assert-payment-proofs"
import { getS3Bucket, getS3Client } from "@/lib/s3"
import {
  EmptyOrMissingProofError,
  isAllowedProofContentType,
  normalizeProofContentType,
  proofObjectHttpError,
} from "@/lib/payment-proof-constraints"

// Admin-only: streams a payment proof's bytes through the app, for callers that cannot reach S3 directly.
// GET honors a single Range header (206). HEAD returns the real size in X-Proof-Size.

type RouteContext = { params: Promise<{ id: string }> }

const BASE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Accept-Ranges": "bytes",
  "X-Content-Type-Options": "nosniff",
}

function isInvalidRange(error: unknown) {
  const record = (error ?? {}) as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } }
  return (record.name || record.Code) === "InvalidRange" || record.$metadata?.httpStatusCode === 416
}

// Body is always the proof-url shape (code empty_proof). HEAD has no body, so it also names the reason in
// X-Proof-Error: missing_proof (no such object) or empty_proof (zero bytes).
function emptyProofResponse(filename: string, objectKey: string, headReason?: "missing_proof" | "empty_proof") {
  const mapped = proofObjectHttpError(new EmptyOrMissingProofError(filename, objectKey))
  return NextResponse.json(mapped, {
    status: 400,
    headers: { "Cache-Control": "private, no-store", ...(headReason ? { "X-Proof-Error": headReason } : {}) },
  })
}

// The stored type is only echoed when it is an allowed proof type; anything else is sent as opaque bytes.
function safeContentType(raw: string | undefined) {
  const normalized = normalizeProofContentType(raw || "")
  return isAllowedProofContentType(normalized) ? normalized : "application/octet-stream"
}

// One range only: bytes=a-b, bytes=a- or bytes=-n
function parseRange(header: string | null): { ok: true; value: string | undefined } | { ok: false } {
  if (header === null) return { ok: true, value: undefined }
  const trimmed = header.trim()
  if (!/^bytes=(\d+-\d*|-\d+)$/.test(trimmed)) return { ok: false }
  return { ok: true, value: trimmed }
}

export const GET = withAuth(
  async (req: NextRequest, user, { params }: RouteContext) => {
    const resolved = await resolvePaymentProof(req, user, params, { allowOwner: false })
    if ("error" in resolved) return resolved.error
    const { attachment, objectKey } = resolved

    const range = parseRange(req.headers.get("range"))
    if (!range.ok) {
      return NextResponse.json({ error: "Invalid Range header", code: "invalid_range" }, { status: 416, headers: BASE_HEADERS })
    }

    let object
    try {
      object = await getS3Client().send(
        new GetObjectCommand({ Bucket: getS3Bucket(), Key: objectKey, ...(range.value ? { Range: range.value } : {}) })
      )
    } catch (error) {
      if (isInvalidRange(error)) {
        return NextResponse.json({ error: "Range not satisfiable", code: "invalid_range" }, { status: 416, headers: BASE_HEADERS })
      }
      if (isS3NotFound(error)) return emptyProofResponse(attachment.filename, objectKey)
      throw error
    }

    const length = object.ContentLength ?? 0
    const body = object.Body as ({ transformToByteArray?: () => Promise<Uint8Array>; destroy?: () => void }) | undefined
    if (length <= 0 && !object.ContentRange) {
      body?.destroy?.()
      return emptyProofResponse(attachment.filename, objectKey)
    }
    if (length > PROOF_ROUTE_MAX_BYTES) {
      body?.destroy?.()
      return NextResponse.json(
        {
          error: `Proof is larger than ${PROOF_ROUTE_MAX_BYTES} bytes; request it in Range chunks`,
          code: "too_large_for_route",
          size: length,
          maxBytes: PROOF_ROUTE_MAX_BYTES,
        },
        { status: 413, headers: BASE_HEADERS }
      )
    }

    const bytes = body?.transformToByteArray ? await body.transformToByteArray() : new Uint8Array()
    const headers: Record<string, string> = {
      ...BASE_HEADERS,
      "Content-Type": safeContentType(object.ContentType || attachment.contentType),
      "Content-Length": String(bytes.length),
      "Content-Disposition": "inline",
    }
    if (object.ContentRange) headers["Content-Range"] = object.ContentRange
    return new NextResponse(Buffer.from(bytes), { status: object.ContentRange ? 206 : 200, headers })
  },
  { adminOnly: true }
)

export const HEAD = withAuth(
  async (req: NextRequest, user, { params }: RouteContext) => {
    const resolved = await resolvePaymentProof(req, user, params, { allowOwner: false })
    if ("error" in resolved) return resolved.error
    const { attachment, objectKey } = resolved

    let head
    try {
      head = await getS3Client().send(new HeadObjectCommand({ Bucket: getS3Bucket(), Key: objectKey }))
    } catch (error) {
      if (isS3NotFound(error)) return emptyProofResponse(attachment.filename, objectKey, "missing_proof")
      throw error
    }

    const size = head.ContentLength ?? 0
    if (size <= 0) return emptyProofResponse(attachment.filename, objectKey, "empty_proof")

    return new NextResponse(null, {
      status: 200,
      headers: {
        ...BASE_HEADERS,
        "Content-Type": safeContentType(head.ContentType || attachment.contentType),
        "X-Proof-Size": String(size),
      },
    })
  },
  { adminOnly: true }
)
