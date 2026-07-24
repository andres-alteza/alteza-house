import { NextRequest, NextResponse } from "next/server"
import { GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { withAuth } from "@/lib/api-auth"
import { getCollection } from "@/lib/mongodb"
import { parseObjectIdParam } from "@/lib/mongo-helpers"
import { normalizeProofAttachments } from "@/lib/payment-proofs"
import { getS3Bucket, getS3Client, parseStoredProofReferenceToObjectKey } from "@/lib/s3"

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
  })
})
