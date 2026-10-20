import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api-auth"
import { parseJson, badRequest } from "@/lib/api-helpers"
import { parseObjectIdParam } from "@/lib/mongo-helpers"
import { getCollection } from "@/lib/mongodb"
import { presignPaymentProofSchema } from "@/lib/schemas/upload"
import { buildProofObjectKey, getS3Bucket, getS3Client } from "@/lib/s3"
import { inferProofContentType, isProofSizeAllowed } from "@/lib/payment-proof-constraints"
import { signPaymentProofPut } from "@/lib/sign-payment-proof-put"

type TenantDoc = {
  _id: import("mongodb").ObjectId
  email: string
}

type ContractDoc = {
  _id: import("mongodb").ObjectId
  tenantId: string
  status: "ready_to_sign" | "signed" | "approved" | "finished"
  startDate: string
  endDate: string
}

function getCurrentLocalDate() {
  const now = new Date()
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return localTime.toISOString().slice(0, 10)
}

export const POST = withAuth(async (req: NextRequest, user) => {
  const parsed = await parseJson(req, presignPaymentProofSchema)
  if ("error" in parsed) return parsed.error

  const { filename, contentType, size, tenantId, paymentId, year, month } = parsed.data
  const normalizedContentType = inferProofContentType(filename, contentType)

  if (!normalizedContentType) {
    return badRequest("Only PDF files or images are allowed")
  }
  if (!isProofSizeAllowed(size)) {
    return badRequest("File must be greater than 0 bytes and at most 10 MB")
  }

  if (user.role !== "admin") {
    const tenantIdParsed = parseObjectIdParam(tenantId)
    if ("error" in tenantIdParsed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const tenantsCol = await getCollection<TenantDoc>("tenants")
    const tenant = await tenantsCol.findOne({ _id: tenantIdParsed.value })
    const isOwner = tenant?.email?.toLowerCase() === user.email.toLowerCase()
    if (!isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const contractsCol = await getCollection<ContractDoc>("contracts")
    const localToday = getCurrentLocalDate()
    const activeContract = await contractsCol.findOne({
      tenantId,
      status: "approved",
      startDate: { $lte: localToday },
      endDate: { $gte: localToday },
    })
    if (!activeContract) {
      return NextResponse.json({ error: "Tenant does not have an active contract" }, { status: 400 })
    }
  }

  const objectKey = buildProofObjectKey(filename, tenantId, paymentId, year, month)
  const uploadUrl = await signPaymentProofPut(getS3Client(), {
    bucket: getS3Bucket(),
    objectKey,
    contentType: normalizedContentType,
    size,
  })

  return NextResponse.json({
    uploadUrl,
    objectKey,
    contentType: normalizedContentType,
  })
})
