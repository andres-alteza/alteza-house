import { NextRequest, NextResponse } from "next/server"
import { getCollection } from "@/lib/mongodb"
import { withAuth } from "@/lib/api-auth"
import { parseObjectIdParam } from "@/lib/mongo-helpers"
import { parseJson } from "@/lib/api-helpers"
import { updateHouseSchema } from "@/lib/schemas/house"

export const PUT = withAuth(
  async (req: NextRequest, _user, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const idParsed = parseObjectIdParam(id)
  if ("error" in idParsed) return idParsed.error

  const bodyParsed = await parseJson(req, updateHouseSchema)
  if ("error" in bodyParsed) return bodyParsed.error
  const { name, address } = bodyParsed.data

  const col = await getCollection("houses")
  await col.updateOne(
    { _id: idParsed.value },
    { $set: { name, address, updatedAt: new Date() } }
  )

  return NextResponse.json({ id, name, address })
  },
  { adminOnly: true }
)

export const DELETE = withAuth(
  async (req: NextRequest, _user, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const idParsed = parseObjectIdParam(id)
  if ("error" in idParsed) return idParsed.error

  const col = await getCollection("houses")
  await col.deleteOne({ _id: idParsed.value })

  return NextResponse.json({ success: true })
  },
  { adminOnly: true }
)
