import { getS3Prefix } from "@/lib/s3"
import {
  EmptyOrMissingContractPdfError,
  InvalidContractPdfKeyError,
  InvalidContractPdfTypeError,
  contractPdfHttpError,
  verifyContractPdfObjects,
  type ContractPdfKind,
  type ContractPdfRef,
} from "@/lib/contract-pdf-constraints"
import { createS3ObjectLookup, type S3Send } from "@/lib/s3-object-lookup"
import { parseStoredS3ReferenceToObjectKey } from "@/lib/s3"

export {
  EmptyOrMissingContractPdfError,
  InvalidContractPdfKeyError,
  InvalidContractPdfTypeError,
  contractPdfHttpError,
}

export async function assertContractPdfInS3(
  attachment: ContractPdfRef | string,
  options: {
    tenantId: string
    contractId: string
    kind: ContractPdfKind
    send?: S3Send
    bucket?: string
    s3Prefix?: string
  }
): Promise<ContractPdfRef & { size: number }> {
  const raw = typeof attachment === "string" ? attachment : attachment.objectKey
  const objectKey = parseStoredS3ReferenceToObjectKey(raw) || raw.trim()
  const filename =
    typeof attachment === "string"
      ? objectKey.split("/").pop() || "contract.pdf"
      : attachment.filename.trim() || objectKey.split("/").pop() || "contract.pdf"
  const contentType = typeof attachment === "string" ? "application/pdf" : attachment.contentType

  const [verified] = await verifyContractPdfObjects(
    [{ objectKey, filename, contentType }],
    createS3ObjectLookup(options),
    {
      tenantId: options.tenantId,
      contractId: options.contractId,
      kind: options.kind,
      s3Prefix: options.s3Prefix ?? getS3Prefix(),
    }
  )
  return verified
}
