import { NextRequest, NextResponse } from "next/server"
import { getCollection } from "@/lib/mongodb"
import { withAuth } from "@/lib/api-auth"
import { parseObjectIdParam } from "@/lib/mongo-helpers"
import { parseJson } from "@/lib/api-helpers"
import { updateContractSchema } from "@/lib/schemas/contract"
import { serializeContract } from "@/lib/serializers/contract"

export const PUT = withAuth(
  async (req: NextRequest, _user, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const idParsed = parseObjectIdParam(id)
  if ("error" in idParsed) return idParsed.error

  const parsed = await parseJson(req, updateContractSchema)
  if ("error" in parsed) return parsed.error

  const col = await getCollection("contracts")
  const existing = await col.findOne({ _id: idParsed.value })
  if (!existing) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 })
  }
  if (existing.status === "approved" || existing.status === "finished") {
    return NextResponse.json({ error: "Approved or finished contracts cannot be modified" }, { status: 400 })
  }

  const tenantId = parsed.data.tenantId ?? existing.tenantId
  const startDate = parsed.data.startDate ?? existing.startDate
  const endDate = parsed.data.endDate ?? existing.endDate

  const overlappingContract = await col.findOne({
    tenantId,
    _id: { $ne: idParsed.value },
    status: { $in: ["ready_to_sign", "signed", "approved", "finished"] },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  })
  if (overlappingContract) {
    return NextResponse.json(
      { error: "Tenant already has an active contract in this period" },
      { status: 409 }
    )
  }

  const updated = await col.findOneAndUpdate(
    { _id: idParsed.value },
    { $set: { ...parsed.data, updatedAt: new Date() } },
    { returnDocument: "after" }
  )
  if (!updated) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 })
  }

  return NextResponse.json(serializeContract(updated))
  },
  { adminOnly: true }
)

export const DELETE = withAuth(
  async (req: NextRequest, _user, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const idParsed = parseObjectIdParam(id)
  if ("error" in idParsed) return idParsed.error

  const col = await getCollection("contracts")
  const existing = await col.findOne({ _id: idParsed.value })
  if (!existing) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 })
  }
  if (existing.status === "approved" || existing.status === "finished") {
    return NextResponse.json({ error: "Approved or finished contracts cannot be deleted" }, { status: 400 })
  }
  await col.deleteOne({ _id: idParsed.value })

  return NextResponse.json({ success: true })
  },
  { adminOnly: true }
)
