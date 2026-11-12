import { NextRequest, NextResponse } from "next/server"
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { withAuth } from "@/lib/api-auth"
import { resolvePaymentProof } from "@/lib/payment-proof-access"
import { getS3Bucket, getS3Client } from "@/lib/s3"
import { EmptyOrMissingProofError, proofObjectHttpError } from "@/lib/payment-proof-constraints"
import { isS3NotFound } from "@/lib/assert-payment-proofs"

export const GET = withAuth(async (req: NextRequest, user, { params }: { params: Promise<{ id: string }> }) => {
  const resolved = await resolvePaymentProof(req, user, params, { allowOwner: true })
  if ("error" in resolved) return resolved.error
  const { attachment, objectKey } = resolved

  const bucket = getS3Bucket()
  const client = getS3Client()

  let size = typeof attachment.size === "number" ? attachment.size : undefined
  if (size === undefined) {
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
  }

  if (!size || size <= 0) {
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
