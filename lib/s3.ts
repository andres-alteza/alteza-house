import { S3Client } from "@aws-sdk/client-s3"

const AWS_REGION = process.env.AWS_REGION
const S3_BUCKET = process.env.S3_BUCKET
const S3_PREFIX = process.env.S3_PREFIX?.trim()

let client: S3Client | null = null

function getClient() {
  if (client) return client

  if (!AWS_REGION) {
    throw new Error("Missing AWS_REGION environment variable")
  }

  client = new S3Client({ region: AWS_REGION })
  return client
}

export function getS3Bucket() {
  if (!S3_BUCKET) {
    throw new Error("Missing S3_BUCKET environment variable")
  }
  return S3_BUCKET
}

export function getS3Client() {
  return getClient()
}

function getRootPrefix() {
  return S3_PREFIX ? `${S3_PREFIX.replace(/^\/+|\/+$/g, "")}/` : ""
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
  const rootPrefix = getRootPrefix()

  return `${rootPrefix}tenants/${normalizedTenantId}/payments/${normalizedYear}/${normalizedPaymentId}-${normalizedMonth}-${cleanedFileName}`
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
