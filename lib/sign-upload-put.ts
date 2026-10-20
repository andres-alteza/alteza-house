import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { putObjectInput } from "./upload-object-constraints"

export type SignUploadPutInput = {
  bucket: string
  objectKey: string
  contentType: string
  size: number
  expiresIn?: number
  signingDate?: Date
}

export const SIGNABLE_PUT_HEADERS = ["content-length", "content-type"] as const

export async function signUploadPut(client: S3Client, input: SignUploadPutInput) {
  const command = new PutObjectCommand(putObjectInput(input))
  return getSignedUrl(client, command, {
    expiresIn: input.expiresIn ?? 60 * 5,
    signingDate: input.signingDate,
    signableHeaders: new Set(SIGNABLE_PUT_HEADERS),
  })
}
