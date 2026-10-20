export const PAYMENT_MAX_BYTES = 10 * 1024 * 1024
export const CONTRACT_MAX_BYTES = 20 * 1024 * 1024

export const PDF_CONTENT_TYPE = "application/pdf"

export const SIGNABLE_UPLOAD_HEADERS = new Set(["content-length", "content-type"])

export type UploadAttachmentRef = {
  objectKey: string
  filename: string
  contentType: string
  size?: number
}

export type UploadObjectLookup = {
  headObject: (objectKey: string) => Promise<{ ContentLength?: number; ContentType?: string } | null>
  getObjectPrefix: (objectKey: string) => Promise<Uint8Array | null>
}

export type UploadObjectErrorConstructor = new (filename: string, objectKey: string) => Error

export type UploadObjectRules<TContext> = {
  maxBytes: number
  requireAtLeastOne: boolean
  emptyListFilename: string
  normalizeContentType: (contentType: string) => string
  isAllowedContentType: (contentType: string) => boolean
  sniffMagic: (bytes: Uint8Array) => string
  contentTypeForMagic: (magic: string) => string
  claimedTypeMatchesMagic: (contentType: string, magic: string) => boolean
  isAllowedObjectKey: (objectKey: string, context: TContext) => boolean
  isStoredSizeAllowed: (size: number) => boolean
  EmptyError: UploadObjectErrorConstructor
  TypeError: UploadObjectErrorConstructor
  KeyError: UploadObjectErrorConstructor
}

export function normalizeS3Prefix(s3Prefix = "") {
  return s3Prefix.trim().replace(/^\/+|\/+$/g, "")
}

export function isUnsafeObjectKey(objectKey: string) {
  const key = objectKey.trim()
  if (!key) return true
  if (key.startsWith("/")) return true
  if (key.includes("..")) return true
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(key)) return true
  return false
}

export function isUploadSizeAllowed(size: number, maxBytes: number) {
  return Number.isInteger(size) && size > 0 && size <= maxBytes
}

export function hasPdfMagicBytes(bytes: Uint8Array) {
  return bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
}

export function putObjectInput(params: {
  bucket: string
  objectKey: string
  contentType: string
  size: number
}) {
  return {
    Bucket: params.bucket,
    Key: params.objectKey,
    ContentType: params.contentType,
    ContentLength: params.size,
  }
}

function resolvedContentType<TContext>(
  rules: UploadObjectRules<TContext>,
  headContentType: string | undefined,
  magic: string
) {
  const fromHead = rules.normalizeContentType(headContentType || "")
  if (fromHead && rules.isAllowedContentType(fromHead)) {
    if (!rules.claimedTypeMatchesMagic(fromHead, magic)) return ""
    return fromHead
  }
  return rules.contentTypeForMagic(magic)
}

export async function verifyUploadedObjects<TContext>(
  attachments: UploadAttachmentRef[],
  lookup: UploadObjectLookup,
  context: TContext,
  rules: UploadObjectRules<TContext>
): Promise<Array<UploadAttachmentRef & { size: number }>> {
  const verified: Array<UploadAttachmentRef & { size: number }> = []

  if (rules.requireAtLeastOne && attachments.length === 0) {
    throw new rules.EmptyError(rules.emptyListFilename, "")
  }

  for (const attachment of attachments) {
    const objectKey = attachment.objectKey.trim()
    const filename = attachment.filename.trim() || objectKey || rules.emptyListFilename
    if (!rules.isAllowedObjectKey(objectKey, context)) {
      throw new rules.KeyError(filename, objectKey)
    }

    const head = await lookup.headObject(objectKey)
    if (!head) {
      throw new rules.EmptyError(filename, objectKey)
    }

    const size = head.ContentLength ?? 0
    if (!rules.isStoredSizeAllowed(size)) {
      throw new rules.EmptyError(filename, objectKey)
    }

    const prefix = await lookup.getObjectPrefix(objectKey)
    if (!prefix) {
      throw new rules.EmptyError(filename, objectKey)
    }
    const magic = rules.sniffMagic(prefix)
    const contentType = resolvedContentType(rules, head.ContentType, magic)
    if (!contentType) {
      throw new rules.TypeError(filename, objectKey)
    }

    verified.push({
      ...attachment,
      objectKey,
      filename,
      contentType,
      size,
    })
  }

  return verified
}
