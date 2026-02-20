import { ObjectId } from "mongodb"
import { NextResponse } from "next/server"

export function parseObjectIdParam(
  id: string
): { value: ObjectId } | { error: NextResponse } {
  if (!ObjectId.isValid(id)) {
    return { error: NextResponse.json({ error: "Invalid id" }, { status: 400 }) }
  }
  return { value: new ObjectId(id) }
}

