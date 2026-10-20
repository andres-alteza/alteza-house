import { S3Client } from "@aws-sdk/client-s3"

let client: S3Client | null = null

function getClient() {
  if (client) return client

  const region = process.env.AWS_REGION
  if (!region) {
    throw new Error("Missing AWS_REGION environment variable")
  }

  const endpoint = process.env.S3_ENDPOINT?.trim()
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  client = new S3Client({
    region,
    ...(endpoint
      ? {
          endpoint,
          forcePathStyle: true,
          ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
          requestChecksumCalculation: "WHEN_REQUIRED",
          responseChecksumValidation: "WHEN_REQUIRED",
        }
      : {}),
  })
  return client
}

export function resetS3Client() {
  if (client) {
    client.destroy()
    client = null
  }
}

export function getS3Bucket() {
  const bucket = process.env.S3_BUCKET
  if (!bucket) {
    throw new Error("Missing S3_BUCKET environment variable")
  }
  return bucket
}

export function getS3Client() {
  return getClient()
}

export function getS3Prefix() {
  const prefix = process.env.S3_PREFIX?.trim()
  return prefix ? prefix.replace(/^\/+|\/+$/g, "") : ""
}

function getRootPrefix() {
  const prefix = getS3Prefix()
  return prefix ? `${prefix}/` : ""
}

function normalizePathToken(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, "")
}

export function buildProofObjectKey(
  rawFileName: string,
  tenantId: string,
  paymentId: string,
  year: number,
  month: number
) {
  const normalizedTenantId = normalizePathToken(tenantId)
  const normalizedPaymentId = normalizePathToken(paymentId)
  const cleanedFileName = rawFileName.toLowerCase().replace(/[^a-z0-9._-]/g, "_")
  const normalizedYear = String(year).replace(/[^0-9]/g, "") || new Date().getFullYear().toString()
  const normalizedMonth = String(month).replace(/[^0-9]/g, "").padStart(2, "0").slice(-2)
  const uniqueSuffix = crypto.randomUUID().slice(0, 8)
  const rootPrefix = getRootPrefix()

  return `${rootPrefix}tenants/${normalizedTenantId}/payments/${normalizedYear}/${normalizedPaymentId}-${normalizedMonth}-${uniqueSuffix}-${cleanedFileName}`
}

export function buildContractObjectKey(tenantId: string, contractId: string, kind: "draft" | "signed") {
  const normalizedTenantId = normalizePathToken(tenantId)
  const normalizedId = contractId.replace(/[^a-zA-Z0-9_-]/g, "")
  const extension = ".pdf"
  const variant = kind === "signed" ? "signed-contract" : "contract"
  const rootPrefix = getRootPrefix()
  return `${rootPrefix}tenants/${normalizedTenantId}/contracts/${normalizedId}-${variant}${extension}`
}

export function parseStoredS3ReferenceToObjectKey(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ""
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return trimmed
  }

  try {
    const url = new URL(trimmed)
    return decodeURIComponent(url.pathname.replace(/^\/+/, ""))
  } catch {
    return ""
  }
}

export const parseStoredProofReferenceToObjectKey = parseStoredS3ReferenceToObjectKey
