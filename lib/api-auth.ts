import { NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/fb-admin"
import { getAdminEmails } from "@/lib/app-settings"

export interface AuthenticatedUser {
  uid: string
  email: string
  role: "admin" | "tenant"
}

export async function authenticateRequest(
  req: NextRequest
): Promise<{ user: AuthenticatedUser } | { error: NextResponse }> {
  const authHeader = req.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: NextResponse.json({ error: "No token provided" }, { status: 401 }) }
  }

  const token = authHeader.split("Bearer ")[1]
  const decoded = await verifyToken(token)
  if (!decoded || !decoded.email) {
    return { error: NextResponse.json({ error: "Invalid token" }, { status: 401 }) }
  }

  const adminEmails = await getAdminEmails()
  const isAdmin = adminEmails.includes(decoded.email.toLowerCase())

  return {
    user: {
      uid: decoded.uid,
      email: decoded.email,
      role: isAdmin ? "admin" : "tenant",
    },
  }
}

export function requireAdmin(user: AuthenticatedUser) {
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  return null
}

type WithAuthOptions = {
  adminOnly?: boolean
}

type AuthenticatedHandler<TContext = unknown> = (
  req: NextRequest,
  user: AuthenticatedUser,
  context: TContext
) => Promise<Response> | Response

export function withAuth<TContext = unknown>(
  handler: AuthenticatedHandler<TContext>,
  options: WithAuthOptions = {}
) {
  return async function wrapped(req: NextRequest, context: TContext) {
    const auth = await authenticateRequest(req)
    if ("error" in auth) return auth.error

    if (options.adminOnly) {
      const forbidden = requireAdmin(auth.user)
      if (forbidden) return forbidden
    }

    return handler(req, auth.user, context)
  }
}
