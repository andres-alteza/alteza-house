import { NextRequest, NextResponse } from "next/server"
import type { ObjectId } from "mongodb"
import type { AuthenticatedUser } from "@/lib/api-auth"
import { getCollection } from "@/lib/mongodb"
import { parseObjectIdParam } from "@/lib/mongo-helpers"
import { normalizeProofAttachments } from "@/lib/payment-proofs"
import { getS3Prefix } from "@/lib/s3"
import {
  InvalidProofKeyError,
  isAllowedProofObjectKey,
  isUnsafeProofObjectKey,
  proofObjectHttpError,
} from "@/lib/payment-proof-constraints"
import type { PaymentProofAttachment } from "@/lib/types"

type PaymentDoc = {
  _id: ObjectId
  tenantId: string
  tenantEmail: string
  proofAttachments?: unknown
  proofImageUrl?: string
}

export type ResolvedPaymentProof = {
  payment: PaymentDoc
  attachment: PaymentProofAttachment
  objectKey: string
}

/**
 * Shared by the proof routes: parse the id, load the payment, check access
 * (admin, or the owning tenant when allowOwner), pick the requested attachment
 * (?objectKey=, default first) and check the object key is allowed.
 * Returns the attachment or the error response to send.
 */
export async function resolvePaymentProof(
  req: NextRequest,
  user: AuthenticatedUser,
  params: Promise<{ id: string }>,
  options: { allowOwner: boolean }
): Promise<ResolvedPaymentProof | { error: NextResponse }> {
  const { id } = await params
  const idParsed = parseObjectIdParam(id)
  if ("error" in idParsed) return { error: idParsed.error }

  const col = await getCollection<PaymentDoc>("payments")
  const payment = await col.findOne({ _id: idParsed.value })
  if (!payment) {
    return { error: NextResponse.json({ error: "Payment not found" }, { status: 404 }) }
  }

  const isOwner = options.allowOwner && payment.tenantEmail.toLowerCase() === user.email.toLowerCase()
  if (user.role !== "admin" && !isOwner) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  const attachments = normalizeProofAttachments(payment)
  if (attachments.length === 0) {
    return { error: NextResponse.json({ error: "Proof file not found" }, { status: 404 }) }
  }

  const requestedKey = req.nextUrl.searchParams.get("objectKey")?.trim() || ""
  if (requestedKey && isUnsafeProofObjectKey(requestedKey)) {
    const mapped = proofObjectHttpError(new InvalidProofKeyError(requestedKey, requestedKey))
    return { error: NextResponse.json(mapped, { status: 400 }) }
  }
  const attachment = requestedKey
    ? attachments.find((item) => item.objectKey === requestedKey)
    : attachments[0]

  if (!attachment) {
    return { error: NextResponse.json({ error: "Proof file not found" }, { status: 404 }) }
  }

  const objectKey = attachment.objectKey.trim()
  if (!isAllowedProofObjectKey(objectKey, payment.tenantId, getS3Prefix())) {
    const mapped = proofObjectHttpError(new InvalidProofKeyError(attachment.filename, objectKey))
    return { error: NextResponse.json(mapped, { status: 400 }) }
  }

  return { payment, attachment, objectKey }
}

/** Largest body the proof bytes route sends in one response (Vercel Functions cap bodies at 4.5 MB). */
export const PROOF_ROUTE_MAX_BYTES = 4_400_000
