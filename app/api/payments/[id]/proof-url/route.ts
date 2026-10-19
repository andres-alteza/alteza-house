import { NextRequest, NextResponse } from "next/server"
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { withAuth } from "@/lib/api-auth"
import { getCollection } from "@/lib/mongodb"
import { parseObjectIdParam } from "@/lib/mongo-helpers"
import { normalizeProofAttachments } from "@/lib/payment-proofs"
import { getS3Bucket, getS3Client, parseStoredProofReferenceToObjectKey } from "@/lib/s3"
import {
  EmptyOrMissingProofError,
  isS3NotFound,
  proofObjectHttpError,
} from "@/lib/assert-payment-proofs"

type PaymentDoc = {
  _id: import("mongodb").ObjectId
  tenantEmail: string
  proofAttachments?: unknown
  proofImageUrl?: string
}

export const GET = withAuth(async (req: NextRequest, user, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const idParsed = parseObjectIdParam(id)
  if ("error" in idParsed) return idParsed.error

  const col = await getCollection<PaymentDoc>("payments")
  const payment = await col.findOne({ _id: idParsed.value })
  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 })
  }

  const isOwner = payment.tenantEmail.toLowerCase() === user.email.toLowerCase()
  if (user.role !== "admin" && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const attachments = normalizeProofAttachments(payment)
  if (attachments.length === 0) {
    return NextResponse.json({ error: "Proof file not found" }, { status: 404 })
  }

  const requestedKey = req.nextUrl.searchParams.get("objectKey")?.trim() || ""
  const requestedNormalized = requestedKey
    ? parseStoredProofReferenceToObjectKey(requestedKey) || requestedKey
    : ""
  const attachment = requestedNormalized
    ? attachments.find((item) => item.objectKey === requestedNormalized)
    : attachments[0]

  if (!attachment) {
    return NextResponse.json({ error: "Proof file not found" }, { status: 404 })
  }

  const objectKey = parseStoredProofReferenceToObjectKey(attachment.objectKey) || attachment.objectKey
  if (!objectKey) {
    return NextResponse.json({ error: "Proof file not found" }, { status: 404 })
  }

  const bucket = getS3Bucket()
  const client = getS3Client()

  let size = 0
  try {
    const head = await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      })
    )
    size = head.ContentLength ?? 0
  } catch (error) {
    if (isS3NotFound(error)) {
      const mapped = proofObjectHttpError(new EmptyOrMissingProofError(attachment.filename, objectKey))
      return NextResponse.json(mapped, { status: 400 })
    }
    throw error
  }

  if (size <= 0) {
    const mapped = proofObjectHttpError(new EmptyOrMissingProofError(attachment.filename, objectKey))
    return NextResponse.json(mapped, { status: 400 })
  }

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
  })
  const url = await getSignedUrl(client, command, { expiresIn: 60 * 5 })

  return NextResponse.json({
    url,
    objectKey: attachment.objectKey,
    filename: attachment.filename,
    contentType: attachment.contentType,
    size,
  })
})
