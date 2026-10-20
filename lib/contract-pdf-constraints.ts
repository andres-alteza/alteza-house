import {
  CONTRACT_MAX_BYTES,
  PDF_CONTENT_TYPE,
  hasPdfMagicBytes,
  isUnsafeObjectKey,
  isUploadSizeAllowed,
  normalizeS3Prefix,
  putObjectInput,
  verifyUploadedObjects,
  type UploadAttachmentRef,
  type UploadObjectLookup,
  type UploadObjectRules,
} from "@/lib/upload-object-constraints"

export { CONTRACT_MAX_BYTES, PDF_CONTENT_TYPE }

export type ContractPdfKind = "draft" | "signed"

export type ContractPdfContext = {
  tenantId: string
  contractId: string
  kind: ContractPdfKind
  s3Prefix?: string
}

export type ContractPdfRef = UploadAttachmentRef
export type ContractPdfLookup = UploadObjectLookup

export class EmptyOrMissingContractPdfError extends Error {
  readonly filename: string
  readonly objectKey: string

  constructor(filename: string, objectKey: string) {
    super(`Contract PDF is empty or missing: ${filename}`)
    this.name = "EmptyOrMissingContractPdfError"
    this.filename = filename
    this.objectKey = objectKey
  }
}

export class InvalidContractPdfTypeError extends Error {
  readonly filename: string
  readonly objectKey: string

  constructor(filename: string, objectKey: string) {
    super(`Contract file is not a valid PDF: ${filename}`)
    this.name = "InvalidContractPdfTypeError"
    this.filename = filename
    this.objectKey = objectKey
  }
}

export class InvalidContractPdfKeyError extends Error {
  readonly filename: string
  readonly objectKey: string

  constructor(filename: string, objectKey: string) {
    super(`Contract object key is not allowed: ${filename}`)
    this.name = "InvalidContractPdfKeyError"
    this.filename = filename
    this.objectKey = objectKey
  }
}

export function normalizeContractContentType(contentType: string) {
  const normalized = contentType.toLowerCase().trim()
  if (normalized !== PDF_CONTENT_TYPE) return ""
  return normalized
}

export function isAllowedContractContentType(contentType: string) {
  return normalizeContractContentType(contentType) === PDF_CONTENT_TYPE
}

export function isContractSizeAllowed(size: number) {
  return isUploadSizeAllowed(size, CONTRACT_MAX_BYTES)
}

export function sniffContractMagicBytes(bytes: Uint8Array) {
  return hasPdfMagicBytes(bytes) ? "pdf" : "unknown"
}

export function contentTypeForContractMagic(magic: string) {
  return magic === "pdf" ? PDF_CONTENT_TYPE : ""
}

export function claimedContractTypeMatchesMagic(contentType: string, magic: string) {
  return normalizeContractContentType(contentType) === PDF_CONTENT_TYPE && magic === "pdf"
}

export function expectedContractObjectKey(
  tenantId: string,
  contractId: string,
  kind: ContractPdfKind,
  s3Prefix = ""
) {
  const root = normalizeS3Prefix(s3Prefix)
  const rootPrefix = root ? `${root}/` : ""
  const tenant = tenantId.trim().replace(/[^a-zA-Z0-9_-]/g, "")
  const id = contractId.trim().replace(/[^a-zA-Z0-9_-]/g, "")
  const variant = kind === "signed" ? "signed-contract" : "contract"
  return `${rootPrefix}tenants/${tenant}/contracts/${id}-${variant}.pdf`
}

export function isAllowedContractObjectKey(
  objectKey: string,
  tenantId: string,
  contractId: string,
  kind: ContractPdfKind,
  s3Prefix = ""
) {
  const key = objectKey.trim()
  if (isUnsafeObjectKey(key)) return false
  return key === expectedContractObjectKey(tenantId, contractId, kind, s3Prefix)
}

export function contractPutObjectInput(params: {
  bucket: string
  objectKey: string
  contentType: string
  size: number
}) {
  return putObjectInput(params)
}

export const CONTRACT_PDF_UPLOAD_RULES: UploadObjectRules<ContractPdfContext> = {
  maxBytes: CONTRACT_MAX_BYTES,
  requireAtLeastOne: true,
  emptyListFilename: "contract.pdf",
  normalizeContentType: normalizeContractContentType,
  isAllowedContentType: isAllowedContractContentType,
  sniffMagic: sniffContractMagicBytes,
  contentTypeForMagic: contentTypeForContractMagic,
  claimedTypeMatchesMagic: claimedContractTypeMatchesMagic,
  isAllowedObjectKey: (objectKey, context) =>
    isAllowedContractObjectKey(
      objectKey,
      context.tenantId,
      context.contractId,
      context.kind,
      context.s3Prefix ?? ""
    ),
  isStoredSizeAllowed: (size) => isContractSizeAllowed(size),
  EmptyError: EmptyOrMissingContractPdfError,
  TypeError: InvalidContractPdfTypeError,
  KeyError: InvalidContractPdfKeyError,
}

export async function verifyContractPdfObjects(
  attachments: ContractPdfRef[],
  lookup: ContractPdfLookup,
  context: ContractPdfContext
): Promise<Array<ContractPdfRef & { size: number }>> {
  return verifyUploadedObjects(attachments, lookup, context, CONTRACT_PDF_UPLOAD_RULES)
}

export function contractPdfHttpError(error: unknown) {
  if (error instanceof EmptyOrMissingContractPdfError) {
    return {
      error: error.message,
      code: "empty_contract" as const,
      filename: error.filename,
    }
  }
  if (error instanceof InvalidContractPdfTypeError) {
    return {
      error: error.message,
      code: "invalid_contract_type" as const,
      filename: error.filename,
    }
  }
  if (error instanceof InvalidContractPdfKeyError) {
    return {
      error: error.message,
      code: "invalid_contract_key" as const,
      filename: error.filename,
    }
  }
  return null
}
