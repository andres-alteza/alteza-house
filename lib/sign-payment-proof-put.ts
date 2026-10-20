import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { paymentProofPutObjectInput } from "./payment-proof-constraints"

export type PaymentProofPutSignInput = {
  bucket: string
  objectKey: string
  contentType: string
  size: number
  expiresIn?: number
  signingDate?: Date
}

const PAYMENT_PROOF_UNSIGNABLE_HEADERS = ["content-length", "content-type"] as const
const PAYMENT_PROOF_SIGNABLE_HEADERS = ["content-length", "content-type"] as const

export async function signPaymentProofPut(client: S3Client, input: PaymentProofPutSignInput) {
  const command = new PutObjectCommand(paymentProofPutObjectInput(input))
  return getSignedUrl(client, command, {
    expiresIn: input.expiresIn ?? 60 * 5,
    signingDate: input.signingDate,
    unsignableHeaders: new Set(PAYMENT_PROOF_UNSIGNABLE_HEADERS),
    signableHeaders: new Set(PAYMENT_PROOF_SIGNABLE_HEADERS),
  })
}
