import { NextRequest, NextResponse } from "next/server"
import { parseJson } from "@/lib/api-helpers"
import { sendPasswordResetEmail } from "@/lib/fb-admin"
import { passwordResetSchema } from "@/lib/schemas/auth"

export async function POST(req: NextRequest) {
  try {
    const parsed = await parseJson(req, passwordResetSchema)
    if ("error" in parsed) return parsed.error
    const email = parsed.data.email.toLowerCase()

    try {
      await sendPasswordResetEmail(email)
      return NextResponse.json({ ok: true })
    } catch (error: any) {
      const code = error?.code || "auth/internal-error"

      // Do not leak whether a user exists.
      if (code === "auth/user-not-found") {
        return NextResponse.json({ ok: true })
      }

      if (code === "auth/invalid-email") {
        return NextResponse.json({ error: "Invalid email", code }, { status: 400 })
      }

      if (code === "auth/too-many-requests") {
        return NextResponse.json({ error: "Too many requests", code }, { status: 429 })
      }

      return NextResponse.json({ error: "Failed to send reset email", code }, { status: 500 })
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to send reset email", code: "auth/internal-error" },
      { status: 500 },
    )
  }
}
