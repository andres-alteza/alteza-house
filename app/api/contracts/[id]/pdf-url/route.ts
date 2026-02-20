import { NextRequest, NextResponse } from "next/server"
import { GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { withAuth } from "@/lib/api-auth"
import { getCollection } from "@/lib/mongodb"
import { parseObjectIdParam } from "@/lib/mongo-helpers"
import { getS3Bucket, getS3Client, parseStoredS3ReferenceToObjectKey } from "@/lib/s3"

type ContractDoc = {
  _id: import("mongodb").ObjectId
  tenantId: string
  pdfUrl?: string
  signedPdfUrl?: string
}

type TenantDoc = {
  _id: import("mongodb").ObjectId
  email: string
}

function getKind(searchParams: URLSearchParams) {
  const raw = searchParams.get("kind")
  return raw === "signed" ? "signed" : "draft"
}

export const GET = withAuth(async (req: NextRequest, user, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const idParsed = parseObjectIdParam(id)
  if ("error" in idParsed) return idParsed.error

  const contractsCol = await getCollection<ContractDoc>("contracts")
  const contract = await contractsCol.findOne({ _id: idParsed.value })
  if (!contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 })
  }

  const isAdmin = user.role === "admin"
  let isOwner = false
  if (!isAdmin) {
    const tenantIdParsed = parseObjectIdParam(contract.tenantId)
    if ("error" in tenantIdParsed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const tenantsCol = await getCollection<TenantDoc>("tenants")
    const tenant = await tenantsCol.findOne({ _id: tenantIdParsed.value })
    isOwner = tenant?.email?.toLowerCase() === user.email.toLowerCase()
  }
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const kind = getKind(req.nextUrl.searchParams)
  const storedValue = kind === "signed" ? contract.signedPdfUrl ?? "" : contract.pdfUrl ?? ""
  const objectKey = parseStoredS3ReferenceToObjectKey(storedValue)
  if (!objectKey) {
    return NextResponse.json({ error: "Contract file not found" }, { status: 404 })
  }

  const bucket = getS3Bucket()
  const client = getS3Client()
  const command = new GetObjectCommand({ Bucket: bucket, Key: objectKey })
  const url = await getSignedUrl(client, command, { expiresIn: 60 * 5 })
  return NextResponse.json({ url })
})
