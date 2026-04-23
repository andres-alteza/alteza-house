import { initializeApp, getApps, cert, deleteApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"

let ready = false

function parseServiceAccountEnv(raw: string) {
  // FIREBASE_ADMIN_SERVICE_ACCOUNT must be base64-encoded service account JSON.
  // This avoids multiline/quoting issues in hosted env providers.
  const encoded = raw.trim()
  let json: string
  try {
    json = Buffer.from(encoded, "base64").toString("utf-8").trim()
  } catch {
    throw new Error(
      "FIREBASE_ADMIN_SERVICE_ACCOUNT must be a valid base64-encoded JSON string.",
    )
  }

  let sa: Record<string, unknown>
  try {
    sa = JSON.parse(json)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown"
    throw new Error(
      "FIREBASE_ADMIN_SERVICE_ACCOUNT decode/parse error. Ensure it is base64(JSON). Details: " +
        msg,
    )
  }

  const projectId = typeof sa.project_id === "string" ? sa.project_id : undefined
  const clientEmail = typeof sa.client_email === "string" ? sa.client_email : undefined
  let privateKey = typeof sa.private_key === "string" ? sa.private_key : undefined

  // Some secret stores double-escape newlines, leaving literal "\n" in the parsed value.
  if (privateKey) privateKey = privateKey.replace(/\\n/g, "\n")

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "FIREBASE_ADMIN_SERVICE_ACCOUNT is missing required fields (project_id, client_email, private_key).",
    )
  }

  return { projectId, clientEmail, privateKey }
}

function init() {
  if (getApps().length > 0 && ready) return getApps()[0]
  for (const a of getApps()) {
    try {
      deleteApp(a)
    } catch {
      /* ignore */
    }
  }

  const saEnv = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT
  if (!saEnv) {
    throw new Error(
      "Missing Firebase Admin credentials. Set FIREBASE_ADMIN_SERVICE_ACCOUNT to base64(service-account-json).",
    )
  }

  const { projectId, clientEmail, privateKey } = parseServiceAccountEnv(saEnv)
  const app = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  })
  ready = true
  return app
}

export async function verifyToken(token: string) {
  try {
    const app = init()
    const decoded = await getAuth(app).verifyIdToken(token)
    return decoded
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "unknown"
    console.error("[v0] fb-admin-v3 verifyToken error:", msg)
    return null
  }
}

export async function getUserByEmail(email: string) {
  try {
    const app = init()
    return await getAuth(app).getUserByEmail(email)
  } catch {
    return null
  }
}

export async function createUserWithEmailPassword({
  email,
  password,
  displayName,
}: {
  email: string
  password: string
  displayName: string
}) {
  const app = init()
  return getAuth(app).createUser({
    email,
    password,
    displayName,
    emailVerified: false,
  })
}

export async function deleteUserByUid(uid: string) {
  const app = init()
  await getAuth(app).deleteUser(uid)
}

export async function updateUserEmailByUid(uid: string, email: string) {
  const app = init()
  return getAuth(app).updateUser(uid, { email })
}

function mapFirebaseAuthErrorCode(rawCode: string): string {
  const code = rawCode.replace(/^auth\//, "")
  if (code === "user-not-found" || code === "EMAIL_NOT_FOUND") return "auth/user-not-found"
  if (code === "invalid-email" || code === "INVALID_EMAIL") return "auth/invalid-email"
  if (
    code === "too-many-requests" ||
    code === "TOO_MANY_ATTEMPTS_TRY_LATER" ||
    code === "quota-exceeded"
  ) {
    return "auth/too-many-requests"
  }
  if (code === "user-disabled" || code === "USER_DISABLED") return "auth/user-disabled"
  return "auth/internal-error"
}

/**
 * Generate a password reset link via Firebase Admin SDK.
 *
 * The returned URL respects the Firebase Auth "Action URL" configured in the
 * Firebase Console (so it points at our custom /reset-password page when the
 * console is configured to do so), and we additionally pass `continueUrl` so
 * Firebase appends it to the link for any post-action redirects.
 */
export async function generatePasswordResetLink(email: string, continueUrl?: string) {
  try {
    const app = init()
    const link = await getAuth(app).generatePasswordResetLink(
      email,
      continueUrl ? { url: continueUrl, handleCodeInApp: false } : undefined
    )
    return link
  } catch (err: any) {
    const rawCode = typeof err?.code === "string" ? err.code : ""
    const mappedCode = mapFirebaseAuthErrorCode(rawCode)
    const error = new Error(
      `Failed to generate Firebase password reset link: ${rawCode || err?.message || "unknown"}`
    ) as Error & { code?: string; firebaseCode?: string }
    error.code = mappedCode
    error.firebaseCode = rawCode
    throw error
  }
}
