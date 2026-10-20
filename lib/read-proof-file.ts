import { getProofFileIssue, inferProofContentType } from "./payment-proof-constraints"

export const UNREADABLE_FILE_CODE = "unreadable_file" as const

export type ProofFileSource = {
  name: string
  type: string
  arrayBuffer: () => Promise<ArrayBuffer>
}

export type ProofUploadError = Error & { code: string }

function throwProofUploadError(code: string, message: string): never {
  const error = new Error(message) as ProofUploadError
  error.code = code
  throw error
}

export function i18nKeyForProofClientError(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code
  if (code === UNREADABLE_FILE_CODE) return "payments.unreadableFileError"
  if (code === "empty_proof") return "payments.emptyFileError"
  if (code === "invalid_proof_type") return "payments.invalidProofError"
  if (code === "too_large") return "payments.fileTooLargeError"
  return null
}

export async function readProofFileForUpload(file: ProofFileSource) {
  let bytes: ArrayBuffer
  try {
    bytes = await file.arrayBuffer()
  } catch {
    throwProofUploadError(UNREADABLE_FILE_CODE, "unreadable-file")
  }

  if (bytes.byteLength === 0) {
    throwProofUploadError(UNREADABLE_FILE_CODE, "unreadable-file")
  }

  const contentType = inferProofContentType(file.name, file.type)
  if (!contentType) {
    throwProofUploadError("invalid_proof_type", "invalid-proof")
  }

  const issue = getProofFileIssue({ name: file.name, type: contentType, size: bytes.byteLength })
  if (issue === "too-large") {
    throwProofUploadError("too_large", "too-large-proof")
  }

  return {
    contentType,
    size: bytes.byteLength,
    body: new Blob([bytes], { type: contentType }),
    filename: file.name,
  }
}
