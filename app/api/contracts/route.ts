import { NextRequest, NextResponse } from "next/server"
import { getCollection } from "@/lib/mongodb"
import { withAuth } from "@/lib/api-auth"
import { parseJson } from "@/lib/api-helpers"
import { createContractSchema } from "@/lib/schemas/contract"
import { serializeContract } from "@/lib/serializers/contract"

export const GET = withAuth(async (req: NextRequest, user) => {
  const col = await getCollection("contracts")
  let query = {}

  // Tenants can only see their own contracts
  if (user.role === "tenant") {
    const tenantsCol = await getCollection("tenants")
    const tenant = await tenantsCol.findOne({ email: user.email })
    if (tenant) {
      query = { tenantId: tenant._id.toString() }
    } else {
      return NextResponse.json([])
    }
  }

  const contracts = await col.find(query).sort({ startDate: -1 }).toArray()

  return NextResponse.json(contracts.map(serializeContract))
})

export const POST = withAuth(
  async (req: NextRequest) => {
  const parsed = await parseJson(req, createContractSchema)
  if ("error" in parsed) return parsed.error
  const { tenantId, tenantName, startDate, endDate, monthlyPrice } = parsed.data

  const col = await getCollection("contracts")
  const overlappingContract = await col.findOne({
    tenantId,
    status: { $in: ["ready_to_sign", "signed", "approved"] },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  })
  if (overlappingContract) {
    return NextResponse.json(
      { error: "Tenant already has an active contract in this period" },
      { status: 409 }
    )
  }

  const contractToInsert = {
    tenantId,
    tenantName,
    startDate,
    endDate,
    monthlyPrice,
    status: "ready_to_sign",
    pdfUrl: "",
    signedPdfUrl: "",
    createdAt: new Date(),
  }
  const result = await col.insertOne(contractToInsert)

  return NextResponse.json(serializeContract({ _id: result.insertedId, ...contractToInsert }), {
    status: 201,
  })
  },
  { adminOnly: true }
)
