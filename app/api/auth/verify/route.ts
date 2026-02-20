import { NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/fb-admin"
import { getCollection } from "@/lib/mongodb"
import { getAdminEmails } from "@/lib/app-settings"
import { parseJson } from "@/lib/api-helpers"
import { verifyTokenSchema } from "@/lib/schemas/auth"

type UserDoc = {
  _id: import("mongodb").ObjectId
  firebaseUid: string
  email: string
  role: "admin" | "tenant"
  name: string
  createdAt: Date
  lastLogin: Date
}

export async function POST(req: NextRequest) {
  try {
    const parsed = await parseJson(req, verifyTokenSchema)
    if ("error" in parsed) return parsed.error
    const { token } = parsed.data

    console.log("[v0] verify-route-v3: token length:", token?.length)
    const decoded = await verifyToken(token)
    console.log("[v0] verify-route-v3: decoded:", decoded ? `uid=${decoded.uid}, email=${decoded.email}` : "null")
    if (!decoded || !decoded.email) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const adminEmails = await getAdminEmails()
    const isAdmin = adminEmails.includes(decoded.email.toLowerCase())

    // Upsert user in DB
    const usersCol = await getCollection<UserDoc>("users")
    const dbUser = await usersCol.findOneAndUpdate(
      { firebaseUid: decoded.uid },
      {
        $set: {
          email: decoded.email,
          role: isAdmin ? "admin" : "tenant",
          lastLogin: new Date(),
        },
        $setOnInsert: {
          firebaseUid: decoded.uid,
          name: decoded.name || decoded.email.split("@")[0],
          createdAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" }
    )
    if (!dbUser) {
      return NextResponse.json({ error: "Authentication failed" }, { status: 500 })
    }

    return NextResponse.json({
      user: {
        id: dbUser._id.toString(),
        firebaseUid: decoded.uid,
        email: decoded.email,
        name: dbUser?.name || decoded.name || decoded.email.split("@")[0],
        role: isAdmin ? "admin" : "tenant",
      },
    })
  } catch (error: any) {
    console.error("Auth verify error:", error?.message)
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 })
  }
}
