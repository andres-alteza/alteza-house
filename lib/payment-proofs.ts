import { parseStoredProofReferenceToObjectKey } from "@/lib/s3"
import type { PaymentProofAttachment } from "@/lib/types"

function inferContentTypeFromObjectKey(objectKey: string) {
  return objectKey.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg"
}

function inferFilenameFromObjectKey(objectKey: string) {
  const segment = objectKey.split("/").pop()?.trim()
  return segment || "proof"
}

export function normalizeProofAttachments(doc: {
  proofAttachments?: unknown
  proofImageUrl?: unknown
}): PaymentProofAttachment[] {
  if (Array.isArray(doc.proofAttachments) && doc.proofAttachments.length > 0) {
    const normalized: PaymentProofAttachment[] = []

    for (const item of doc.proofAttachments) {
      if (!item || typeof item !== "object") continue
      const record = item as Record<string, unknown>
      const rawKey = typeof record.objectKey === "string" ? record.objectKey.trim() : ""
      const objectKey = parseStoredProofReferenceToObjectKey(rawKey) || rawKey
      if (!objectKey) continue

      const filename =
        typeof record.filename === "string" && record.filename.trim()
          ? record.filename.trim()
          : inferFilenameFromObjectKey(objectKey)
      const contentType =
        typeof record.contentType === "string" && record.contentType.trim()
          ? record.contentType.trim()
          : inferContentTypeFromObjectKey(objectKey)
      const uploadedAt =
        typeof record.uploadedAt === "string" && record.uploadedAt.trim()
          ? record.uploadedAt.trim()
          : undefined

      normalized.push({ objectKey, filename, contentType, uploadedAt })
    }

    if (normalized.length > 0) return normalized
  }

  const legacy =
    typeof doc.proofImageUrl === "string" ? doc.proofImageUrl.trim() : ""
  if (!legacy) return []

  const objectKey = parseStoredProofReferenceToObjectKey(legacy) || legacy
  if (!objectKey) return []

  return [
    {
      objectKey,
      filename: inferFilenameFromObjectKey(objectKey),
      contentType: inferContentTypeFromObjectKey(objectKey),
    },
  ]
}

export function toStoredProofAttachments(
  attachments: Array<{
    objectKey: string
    filename: string
    contentType: string
    uploadedAt?: string
  }>
): PaymentProofAttachment[] {
  return attachments.map((attachment) => ({
    objectKey: attachment.objectKey.trim(),
    filename: attachment.filename.trim(),
    contentType: attachment.contentType.trim(),
    uploadedAt: attachment.uploadedAt?.trim() || new Date().toISOString(),
  }))
}
