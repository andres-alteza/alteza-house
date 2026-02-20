import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-auth"
import { parseObjectIdParam } from "@/lib/mongo-helpers"
import { parseJson } from "@/lib/api-helpers"
import { getCollection } from "@/lib/mongodb"
import { serializeContract } from "@/lib/serializers/contract"

const finishContractSchema = z.object({
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD"),
})

export const POST = withAuth(
  async (req: NextRequest, _user, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const idParsed = parseObjectIdParam(id)
  if ("error" in idParsed) return idParsed.error

  const body = await parseJson(req, finishContractSchema)
  if ("error" in body) return body.error

  const col = await getCollection("contracts")
  const existing = await col.findOne({ _id: idParsed.value })
  if (!existing) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 })
  }

  if (existing.status !== "approved") {
    return NextResponse.json(
      { error: "Only approved contracts can be finished" },
      { status: 400 }
    )
  }

  const updated = await col.findOneAndUpdate(
    { _id: idParsed.value },
    {
      $set: {
        endDate: body.data.endDate,
        status: "finished",
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" }
  )
  if (!updated) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 })
  }

  return NextResponse.json(serializeContract(updated))
  },
  { adminOnly: true }
)
