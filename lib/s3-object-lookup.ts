import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"
import { getS3Bucket, getS3Client, getS3Prefix } from "@/lib/s3"
import type { UploadObjectLookup } from "@/lib/upload-object-constraints"

export type S3Send = (command: unknown) => Promise<{
  ContentLength?: number
  ContentType?: string
  Body?: { transformToByteArray?: () => Promise<Uint8Array> } | Uint8Array
}>

export function isS3NotFound(error: unknown) {
  if (!error || typeof error !== "object") return false
  const record = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } }
  const status = record.$metadata?.httpStatusCode
  const name = record.name || record.Code || ""
  return (
    name === "NotFound" ||
    name === "NoSuchKey" ||
    name === "AccessDenied" ||
    name === "Forbidden" ||
    name === "AllAccessDisabled" ||
    status === 403 ||
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

export function createS3ObjectLookup(options: { send?: S3Send; bucket?: string }): UploadObjectLookup {
  const send = options.send ?? ((command) => getS3Client().send(command as never))
  const bucket = options.bucket ?? getS3Bucket()

  return {
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
            Range: "bytes=0-63",
          })
        )
        return readBodyBytes(object.Body)
      } catch (error) {
        if (isS3NotFound(error)) return null
        throw error
      }
    },
  }
}

export function resolveS3LookupOptions(options: { send?: S3Send; bucket?: string; s3Prefix?: string }) {
  return {
    lookup: createS3ObjectLookup(options),
    s3Prefix: options.s3Prefix ?? getS3Prefix(),
  }
}
