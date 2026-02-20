import { NextRequest, NextResponse } from "next/server"
import { getCollection } from "@/lib/mongodb"
import { withAuth } from "@/lib/api-auth"
import { parseJson } from "@/lib/api-helpers"
import { createHouseSchema } from "@/lib/schemas/house"
import { serializeHouse } from "@/lib/serializers/house"

export const GET = withAuth(async (_req: NextRequest) => {
  const col = await getCollection("houses")
  const houses = await col.find({}).sort({ name: 1 }).toArray()

  return NextResponse.json(houses.map(serializeHouse))
})

export const POST = withAuth(
  async (req: NextRequest) => {
  const parsed = await parseJson(req, createHouseSchema)
  if ("error" in parsed) return parsed.error
  const { name, address } = parsed.data

  const col = await getCollection("houses")
  const result = await col.insertOne({
    name,
    address,
    createdAt: new Date(),
  })

  return NextResponse.json(
    {
      id: result.insertedId.toString(),
      name,
      address,
    },
    { status: 201 }
  )
  },
  { adminOnly: true }
)
