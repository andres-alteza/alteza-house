import {
  PAYMENT_MAX_BYTES,
  isUnsafeObjectKey,
  normalizeS3Prefix,
  putObjectInput,
  verifyUploadedObjects,
  type UploadObjectLookup,
  type UploadObjectRules,
} from "@/lib/upload-object-constraints"

export { PAYMENT_MAX_BYTES, normalizeS3Prefix }

export const PAYMENT_PROOF_MAX_BYTES = PAYMENT_MAX_BYTES

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

const ALLOWED_NORMALIZED_CONTENT_TYPES = new Set<string>([
  PAYMENT_PROOF_PDF_CONTENT_TYPE,
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
  "image/avif",
  "image/bmp",
])

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
  ".avif",
  ".bmp",
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

const AVIF_BRANDS = new Set(["avif", "avis", "avio"])

export type ProofMagicKind =
  | "jpeg"
  | "png"
  | "pdf"
  | "heic"
  | "webp"
  | "gif"
  | "avif"
  | "bmp"
  | "unknown"

export type ProofFileIssue = "type" | "empty" | "too-large"

export function normalizeProofContentType(contentType: string) {
  const normalized = contentType.toLowerCase().trim()
  if (normalized === "image/jpg" || normalized === "image/pjpeg") return "image/jpeg"
  if (normalized === "image/x-png") return "image/png"
  return normalized
}

export function isAllowedProofContentType(contentType: string) {
  const normalized = normalizeProofContentType(contentType)
  return ALLOWED_NORMALIZED_CONTENT_TYPES.has(normalized)
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
  return Number.isInteger(size) && size > 0 && size <= PAYMENT_MAX_BYTES
}

export function getProofFileIssue(file: { name: string; type: string; size: number }): ProofFileIssue | null {
  if (!Number.isFinite(file.size) || file.size <= 0) return "empty"
  if (file.size > PAYMENT_PROOF_MAX_BYTES) return "too-large"
  if (!inferProofContentType(file.name, file.type)) return "type"
  return null
}

export function proofObjectKeyPrefix(tenantId: string, s3Prefix = "") {
  const root = normalizeS3Prefix(s3Prefix)
  const rootPrefix = root ? `${root}/` : ""
  const tenant = tenantId.trim().replace(/[^a-zA-Z0-9_-]/g, "")
  return `${rootPrefix}tenants/${tenant}/payments/`
}

export function isUnsafeProofObjectKey(objectKey: string) {
  return isUnsafeObjectKey(objectKey)
}

export function isAllowedProofObjectKey(objectKey: string, tenantId: string, s3Prefix = "") {
  const key = objectKey.trim()
  if (isUnsafeProofObjectKey(key)) return false
  return key.startsWith(proofObjectKeyPrefix(tenantId, s3Prefix))
}

function readFourCc(bytes: Uint8Array, offset: number) {
  if (offset + 4 > bytes.length) return ""
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])
}

function isoBmffBrands(bytes: Uint8Array) {
  if (readFourCc(bytes, 4) !== "ftyp") return []
  const brands: string[] = [readFourCc(bytes, 8).toLowerCase()]
  for (let offset = 16; offset + 4 <= bytes.length; offset += 4) {
    brands.push(readFourCc(bytes, offset).toLowerCase())
  }
  return brands
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
  if (
    bytes.length >= 12 &&
    readFourCc(bytes, 0) === "RIFF" &&
    readFourCc(bytes, 8) === "WEBP"
  ) {
    return "webp"
  }
  if (bytes.length >= 4 && readFourCc(bytes, 0).startsWith("GIF8")) {
    return "gif"
  }
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return "bmp"
  }

  const brands = isoBmffBrands(bytes)
  if (brands.some((brand) => AVIF_BRANDS.has(brand))) return "avif"
  if (brands.some((brand) => HEIF_BRANDS.has(brand))) return "heic"
  return "unknown"
}

export function contentTypeForProofMagic(magic: ProofMagicKind) {
  if (magic === "jpeg") return "image/jpeg"
  if (magic === "png") return "image/png"
  if (magic === "pdf") return PAYMENT_PROOF_PDF_CONTENT_TYPE
  if (magic === "heic") return "image/heic"
  if (magic === "webp") return "image/webp"
  if (magic === "gif") return "image/gif"
  if (magic === "avif") return "image/avif"
  if (magic === "bmp") return "image/bmp"
  return ""
}

export function claimedProofTypeMatchesMagic(contentType: string, magic: ProofMagicKind) {
  const normalized = normalizeProofContentType(contentType)
  if (normalized === PAYMENT_PROOF_PDF_CONTENT_TYPE) return magic === "pdf"
  if (normalized === "image/jpeg") return magic === "jpeg"
  if (normalized === "image/png") return magic === "png"
  if (normalized === "image/webp") return magic === "webp"
  if (normalized === "image/gif") return magic === "gif"
  if (normalized === "image/bmp") return magic === "bmp"
  if (normalized === "image/avif") return magic === "avif"
  if (normalized.includes("heic") || normalized.includes("heif")) return magic === "heic"
  return false
}

export function paymentProofPutObjectInput(params: {
  bucket: string
  objectKey: string
  contentType: string
  size: number
}) {
  return putObjectInput(params)
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

export class InvalidProofKeyError extends Error {
  readonly filename: string
  readonly objectKey: string

  constructor(filename: string, objectKey: string) {
    super(`Proof object key is not allowed: ${filename}`)
    this.name = "InvalidProofKeyError"
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

export type ProofObjectLookup = UploadObjectLookup

export type VerifyProofObjectsContext = {
  tenantId: string
  s3Prefix?: string
}

export const PAYMENT_PROOF_UPLOAD_RULES: UploadObjectRules<VerifyProofObjectsContext> = {
  maxBytes: PAYMENT_MAX_BYTES,
  requireAtLeastOne: true,
  emptyListFilename: "proof",
  normalizeContentType: normalizeProofContentType,
  isAllowedContentType: isAllowedProofContentType,
  sniffMagic: (bytes) => sniffProofMagicBytes(bytes),
  contentTypeForMagic: (magic) => contentTypeForProofMagic(magic as ProofMagicKind),
  claimedTypeMatchesMagic: (contentType, magic) =>
    claimedProofTypeMatchesMagic(contentType, magic as ProofMagicKind),
  isAllowedObjectKey: (objectKey, context) =>
    isAllowedProofObjectKey(objectKey, context.tenantId, context.s3Prefix ?? ""),
  isStoredSizeAllowed: (size) => Number.isFinite(size) && size > 0,
  EmptyError: EmptyOrMissingProofError,
  TypeError: InvalidProofTypeError,
  KeyError: InvalidProofKeyError,
}

export async function verifyProofObjects(
  attachments: ProofAttachmentRef[],
  lookup: ProofObjectLookup,
  context: VerifyProofObjectsContext
): Promise<Array<ProofAttachmentRef & { size: number }>> {
  return verifyUploadedObjects(attachments, lookup, context, PAYMENT_PROOF_UPLOAD_RULES)
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
  if (error instanceof InvalidProofKeyError) {
    return {
      error: error.message,
      code: "invalid_proof_key" as const,
      filename: error.filename,
    }
  }
  return null
}
