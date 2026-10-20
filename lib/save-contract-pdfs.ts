import { assertContractPdfInS3 } from "@/lib/assert-contract-pdfs"
import type { S3Send } from "@/lib/s3-object-lookup"

export function destinationTenantId(existingTenantId: string, requestedTenantId?: string) {
  const next = requestedTenantId?.trim()
  return next || existingTenantId
}

export async function verifyContractPdfsBeforeSave(params: {
  existingTenantId: string
  requestedTenantId?: string
  contractId: string
  pdfUrl?: string
  signedPdfUrl?: string
  send?: S3Send
  bucket?: string
  s3Prefix?: string
}) {
  const tenantId = destinationTenantId(params.existingTenantId, params.requestedTenantId)
  const s3 = {
    send: params.send,
    bucket: params.bucket,
    s3Prefix: params.s3Prefix,
  }

  const verified: { pdfUrl?: string; signedPdfUrl?: string } = {}
  if (params.pdfUrl) {
    const draft = await assertContractPdfInS3(params.pdfUrl, {
      ...s3,
      tenantId,
      contractId: params.contractId,
      kind: "draft",
    })
    verified.pdfUrl = draft.objectKey
  }
  if (params.signedPdfUrl) {
    const signed = await assertContractPdfInS3(params.signedPdfUrl, {
      ...s3,
      tenantId,
      contractId: params.contractId,
      kind: "signed",
    })
    verified.signedPdfUrl = signed.objectKey
  }
  return { tenantId, ...verified }
}
