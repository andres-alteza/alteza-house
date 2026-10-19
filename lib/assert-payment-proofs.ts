import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"
import { getS3Bucket, getS3Client } from "@/lib/s3"
import {
  EmptyOrMissingProofError,
  InvalidProofTypeError,
  proofObjectHttpError,
  verifyProofObjects,
  type ProofAttachmentRef,
} from "@/lib/payment-proof-constraints"

export {
  EmptyOrMissingProofError,
  InvalidProofTypeError,
  proofObjectHttpError,
  type ProofAttachmentRef,
}

export type S3Send = (command: unknown) => Promise<{
  ContentLength?: number
  Body?: { transformToByteArray?: () => Promise<Uint8Array> } | Uint8Array
}>

export function isS3NotFound(error: unknown) {
  if (!error || typeof error !== "object") return false
  const record = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } }
  const status = record.$metadata?.httpStatusCode
  return (
    record.name === "NotFound" ||
    record.name === "NoSuchKey" ||
    record.Code === "NotFound" ||
    record.Code === "NoSuchKey" ||
    status === 404
  )
}

async function readBodyBytes(body: { transformToByteArray?: () => Promise<Uint8Array> } | Uint8Array | undefined) {
  if (!body) return new Uint8Array()
  if (body instanceof Uint8Array) return body
  if (typeof body.transformToByteArray === "function") {
    return body.transformToByteArray()
  }
  return new Uint8Array()
}

export async function assertProofAttachmentsInS3(
  attachments: ProofAttachmentRef[],
  options?: {
    send?: S3Send
    bucket?: string
  }
): Promise<Array<ProofAttachmentRef & { size: number }>> {
  const send = options?.send ?? ((command) => getS3Client().send(command as never))
  const bucket = options?.bucket ?? getS3Bucket()

  return verifyProofObjects(attachments, {
    headObject: async (objectKey) => {
      try {
        return await send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }))
      } catch (error) {
        if (isS3NotFound(error)) return null
        throw error
      }
    },
    getObjectPrefix: async (objectKey) => {
      try {
        const object = await send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: objectKey,
            Range: "bytes=0-31",
          })
        )
        return readBodyBytes(object.Body)
      } catch (error) {
        if (isS3NotFound(error)) return null
        throw error
      }
    },
  })
}
