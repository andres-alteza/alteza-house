export const PAYMENT_PROOF_MAX_BYTES = 10 * 1024 * 1024

export const PAYMENT_PROOF_PDF_CONTENT_TYPE = "application/pdf"

export const PAYMENT_PROOF_ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/x-png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
  "image/avif",
  "image/bmp",
] as const

export const PAYMENT_PROOF_FILE_ACCEPT = [
  "image/*",
  "application/pdf",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".heic",
  ".heif",
  ".webp",
  ".gif",
].join(",")

const HEIF_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "hevm",
  "hevs",
  "mif1",
  "msf1",
  "heif",
])

export type ProofMagicKind = "jpeg" | "png" | "pdf" | "heic" | "unknown"

export type ProofFileIssue = "type" | "empty" | "too-large"

export function normalizeProofContentType(contentType: string) {
  const normalized = contentType.toLowerCase().trim()
  if (normalized === "image/jpg" || normalized === "image/pjpeg") return "image/jpeg"
  if (normalized === "image/x-png") return "image/png"
  return normalized
}

export function isAllowedProofContentType(contentType: string) {
  const normalized = normalizeProofContentType(contentType)
  if (!normalized) return false
  if (normalized === PAYMENT_PROOF_PDF_CONTENT_TYPE) return true
  if (normalized.startsWith("image/")) return true
  return (PAYMENT_PROOF_ALLOWED_IMAGE_TYPES as readonly string[]).includes(normalized)
}

export function inferProofContentType(filename: string, contentType?: string) {
  const fromHeader = normalizeProofContentType(contentType || "")
  if (isAllowedProofContentType(fromHeader)) return fromHeader

  const name = filename.toLowerCase().trim()
  if (name.endsWith(".pdf")) return PAYMENT_PROOF_PDF_CONTENT_TYPE
  if (name.endsWith(".png")) return "image/png"
  if (name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".jpe")) return "image/jpeg"
  if (name.endsWith(".heic")) return "image/heic"
  if (name.endsWith(".heif")) return "image/heif"
  if (name.endsWith(".webp")) return "image/webp"
  if (name.endsWith(".gif")) return "image/gif"
  if (name.endsWith(".avif")) return "image/avif"
  if (name.endsWith(".bmp")) return "image/bmp"
  return ""
}

export function isProofSizeAllowed(size: number) {
  return Number.isInteger(size) && size > 0 && size <= PAYMENT_PROOF_MAX_BYTES
}

export function getProofFileIssue(file: { name: string; type: string; size: number }): ProofFileIssue | null {
  if (!Number.isFinite(file.size) || file.size <= 0) return "empty"
  if (file.size > PAYMENT_PROOF_MAX_BYTES) return "too-large"
  if (!inferProofContentType(file.name, file.type)) return "type"
  return null
}

function readFourCc(bytes: Uint8Array, offset: number) {
  if (offset + 4 > bytes.length) return ""
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])
}

function isHeifContainer(bytes: Uint8Array) {
  if (readFourCc(bytes, 4) !== "ftyp") return false
  const brands: string[] = [readFourCc(bytes, 8).toLowerCase()]
  for (let offset = 16; offset + 4 <= bytes.length; offset += 4) {
    brands.push(readFourCc(bytes, offset).toLowerCase())
  }
  return brands.some((brand) => HEIF_BRANDS.has(brand))
}

export function sniffProofMagicBytes(bytes: Uint8Array): ProofMagicKind {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg"
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png"
  }
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "pdf"
  }
  if (isHeifContainer(bytes)) return "heic"
  return "unknown"
}

export function shouldSniffProofMagic(contentType: string) {
  const normalized = normalizeProofContentType(contentType)
  if (normalized === PAYMENT_PROOF_PDF_CONTENT_TYPE) return true
  if (normalized === "image/jpeg" || normalized === "image/png") return true
  if (normalized.includes("heic") || normalized.includes("heif")) return true
  return false
}

export function claimedProofTypeMatchesMagic(contentType: string, magic: ProofMagicKind) {
  const normalized = normalizeProofContentType(contentType)
  if (normalized === PAYMENT_PROOF_PDF_CONTENT_TYPE) return magic === "pdf"
  if (normalized === "image/jpeg") return magic === "jpeg"
  if (normalized === "image/png") return magic === "png"
  if (normalized.includes("heic") || normalized.includes("heif")) return magic === "heic"
  if (normalized.startsWith("image/")) return true
  return false
}

export function paymentProofPutObjectInput(params: {
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

export class EmptyOrMissingProofError extends Error {
  readonly filename: string
  readonly objectKey: string

  constructor(filename: string, objectKey: string) {
    super(`Proof file is empty or missing: ${filename}`)
    this.name = "EmptyOrMissingProofError"
    this.filename = filename
    this.objectKey = objectKey
  }
}

export class InvalidProofTypeError extends Error {
  readonly filename: string
  readonly objectKey: string

  constructor(filename: string, objectKey: string) {
    super(`Proof file is not a valid PDF or image: ${filename}`)
    this.name = "InvalidProofTypeError"
    this.filename = filename
    this.objectKey = objectKey
  }
}

export type ProofAttachmentRef = {
  objectKey: string
  filename: string
  contentType: string
  size?: number
}

export type ProofObjectLookup = {
  headObject: (objectKey: string) => Promise<{ ContentLength?: number } | null>
  getObjectPrefix: (objectKey: string) => Promise<Uint8Array | null>
}

export async function verifyProofObjects(
  attachments: ProofAttachmentRef[],
  lookup: ProofObjectLookup
): Promise<Array<ProofAttachmentRef & { size: number }>> {
  const verified: Array<ProofAttachmentRef & { size: number }> = []

  if (attachments.length === 0) {
    throw new EmptyOrMissingProofError("proof", "")
  }

  for (const attachment of attachments) {
    const objectKey = attachment.objectKey.trim()
    const filename = attachment.filename.trim() || objectKey || "proof"
    if (!objectKey) {
      throw new EmptyOrMissingProofError(filename, objectKey)
    }

    const head = await lookup.headObject(objectKey)
    if (!head) {
      throw new EmptyOrMissingProofError(filename, objectKey)
    }

    const size = head.ContentLength ?? 0
    if (!Number.isFinite(size) || size <= 0) {
      throw new EmptyOrMissingProofError(filename, objectKey)
    }

    if (shouldSniffProofMagic(attachment.contentType)) {
      const prefix = await lookup.getObjectPrefix(objectKey)
      if (!prefix) {
        throw new EmptyOrMissingProofError(filename, objectKey)
      }
      const magic = sniffProofMagicBytes(prefix)
      if (!claimedProofTypeMatchesMagic(attachment.contentType, magic)) {
        throw new InvalidProofTypeError(filename, objectKey)
      }
    }

    verified.push({
      ...attachment,
      objectKey,
      filename,
      size,
    })
  }

  return verified
}

export function proofObjectHttpError(error: unknown) {
  if (error instanceof EmptyOrMissingProofError) {
    return {
      error: error.message,
      code: "empty_proof" as const,
      filename: error.filename,
    }
  }
  if (error instanceof InvalidProofTypeError) {
    return {
      error: error.message,
      code: "invalid_proof_type" as const,
      filename: error.filename,
    }
  }
  return null
}
