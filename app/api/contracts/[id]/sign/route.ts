import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-auth"
import { parseJson } from "@/lib/api-helpers"
import { getCollection } from "@/lib/mongodb"
import { parseObjectIdParam } from "@/lib/mongo-helpers"
import { serializeContract } from "@/lib/serializers/contract"
import { contractPdfHttpError } from "@/lib/assert-contract-pdfs"
import { verifyContractPdfsBeforeSave } from "@/lib/save-contract-pdfs"

type ContractDoc = {
  _id: import("mongodb").ObjectId
  tenantId: string
  status?: "ready_to_sign" | "signed" | "approved" | "finished"
}

type TenantDoc = {
  _id: import("mongodb").ObjectId
  email: string
}

const signContractSchema = z.object({
  signedPdfUrl: z.string().trim().min(1, "signedPdfUrl is required"),
})

export const POST = withAuth(async (req: NextRequest, user, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const idParsed = parseObjectIdParam(id)
  if ("error" in idParsed) return idParsed.error

  const body = await parseJson(req, signContractSchema)
  if ("error" in body) return body.error

  const contractsCol = await getCollection<ContractDoc>("contracts")
  const contract = await contractsCol.findOne({ _id: idParsed.value })
  if (!contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 })
  }

  if (user.role === "admin") {
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
  if (contract.status === "approved" || contract.status === "finished") {
    return NextResponse.json({ error: "Approved or finished contracts cannot be modified" }, { status: 400 })
  }
  if (contract.status !== "ready_to_sign") {
    return NextResponse.json(
      { error: "Contract is not ready to be signed" },
      { status: 400 }
    )
  }

  let signedPdfUrl: string
  try {
    const verified = await verifyContractPdfsBeforeSave({
      existingTenantId: contract.tenantId,
      contractId: contract._id.toString(),
      signedPdfUrl: body.data.signedPdfUrl,
    })
    if (!verified.signedPdfUrl) {
      return NextResponse.json({ error: "signedPdfUrl is required" }, { status: 400 })
    }
    signedPdfUrl = verified.signedPdfUrl
  } catch (error) {
    const mapped = contractPdfHttpError(error)
    if (mapped) return NextResponse.json(mapped, { status: 400 })
    throw error
  }

  const updated = await contractsCol.findOneAndUpdate(
    { _id: idParsed.value },
    {
      $set: {
        signedPdfUrl,
        status: "signed",
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" }
  )
  if (!updated) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 })
  }

  return NextResponse.json(serializeContract(updated))
})
