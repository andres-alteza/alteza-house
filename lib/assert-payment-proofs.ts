import { getS3Prefix } from "@/lib/s3"
import {
  EmptyOrMissingProofError,
  InvalidProofKeyError,
  InvalidProofTypeError,
  proofObjectHttpError,
  verifyProofObjects,
  type ProofAttachmentRef,
} from "@/lib/payment-proof-constraints"
import { createS3ObjectLookup, isS3NotFound, type S3Send } from "@/lib/s3-object-lookup"

export {
  EmptyOrMissingProofError,
  InvalidProofKeyError,
  InvalidProofTypeError,
  proofObjectHttpError,
  type ProofAttachmentRef,
}

export type { S3Send }
export { isS3NotFound }

export async function assertProofAttachmentsInS3(
  attachments: ProofAttachmentRef[],
  options: {
    tenantId: string
    send?: S3Send
    bucket?: string
    s3Prefix?: string
  }
): Promise<Array<ProofAttachmentRef & { size: number }>> {
  const s3Prefix = options.s3Prefix ?? getS3Prefix()
  return verifyProofObjects(attachments, createS3ObjectLookup(options), {
    tenantId: options.tenantId,
    s3Prefix,
  })
}
