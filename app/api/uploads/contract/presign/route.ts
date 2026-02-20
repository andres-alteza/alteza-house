import { NextRequest, NextResponse } from "next/server"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { withAuth } from "@/lib/api-auth"
import { parseJson, badRequest } from "@/lib/api-helpers"
import { parseObjectIdParam } from "@/lib/mongo-helpers"
import { getCollection } from "@/lib/mongodb"
import { presignContractUploadSchema } from "@/lib/schemas/upload"
import { buildContractObjectKey, getS3Bucket, getS3Client } from "@/lib/s3"

type ContractDoc = {
  _id: import("mongodb").ObjectId
  tenantId: string
  status?: "ready_to_sign" | "signed" | "approved" | "finished"
  pdfUrl?: string
  signedPdfUrl?: string
}

type TenantDoc = {
  _id: import("mongodb").ObjectId
  email: string
}

const PDF_CONTENT_TYPE = "application/pdf"

function normalizeContractContentType(contentType: string) {
  const normalized = contentType.toLowerCase()
  if (normalized !== PDF_CONTENT_TYPE) return ""
  return normalized
}

export const POST = withAuth(async (req: NextRequest, user) => {
  const parsed = await parseJson(req, presignContractUploadSchema)
  if ("error" in parsed) return parsed.error

  const { contractId, contentType, kind } = parsed.data
  const normalizedContentType = normalizeContractContentType(contentType)
  if (!normalizedContentType) {
    return badRequest("Only PDF files are allowed")
  }

  const contractIdParsed = parseObjectIdParam(contractId)
  if ("error" in contractIdParsed) return contractIdParsed.error

  const contractsCol = await getCollection<ContractDoc>("contracts")
  const contract = await contractsCol.findOne({ _id: contractIdParsed.value })
  if (!contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 })
  }

  if (user.role === "admin") {
    if (kind !== "draft") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  } else {
    if (kind !== "signed") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const tenantIdParsed = parseObjectIdParam(contract.tenantId)
    if ("error" in tenantIdParsed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const tenantsCol = await getCollection<TenantDoc>("tenants")
    const tenant = await tenantsCol.findOne({ _id: tenantIdParsed.value })
    const isOwner = tenant?.email?.toLowerCase() === user.email.toLowerCase()
    if (!isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }
  if (contract.status === "approved" || contract.status === "finished") {
    return badRequest("Approved or finished contracts cannot be modified")
  }
  if (kind === "signed" && contract.status !== "ready_to_sign") {
    return badRequest("Contract is not ready to be signed")
  }

  const objectKey = buildContractObjectKey(contract.tenantId, contractId, kind)
  const bucket = getS3Bucket()
  const client = getS3Client()
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: normalizedContentType,
  })
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 60 * 5 })

  if (kind === "signed") {
    await contractsCol.updateOne(
      { _id: contractIdParsed.value },
      {
        $set: {
          signedPdfUrl: objectKey,
          status: "signed",
          updatedAt: new Date(),
        },
      }
    )
  } else {
    await contractsCol.updateOne(
      { _id: contractIdParsed.value },
      {
        $set: {
          pdfUrl: objectKey,
          updatedAt: new Date(),
        },
      }
    )
  }

  return NextResponse.json({
    uploadUrl,
    objectKey,
    contentType: normalizedContentType,
  })
})
