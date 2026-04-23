import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { getCollection } from "@/lib/mongodb"
import { withAuth } from "@/lib/api-auth"
import { DEFAULT_SETTINGS, SETTINGS_ID } from "@/lib/app-settings"
import { parseJson } from "@/lib/api-helpers"
import { settingsSchema } from "@/lib/schemas/settings"
import {
  createUserWithEmailPassword,
  deleteUserByUid,
  generatePasswordResetLink,
  getUserByEmail,
} from "@/lib/fb-admin"
import { sendPasswordResetEmail } from "@/lib/resend"

function resolveAppOrigin(req: NextRequest) {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim()
  if (envUrl) return envUrl.replace(/\/$/, "")
  return new URL(req.url).origin
}

type SettingsDoc = {
  _id: string
  adminEmails: string[]
  enableNotifications: boolean
  notificationEmails: string[]
  notificationEmail?: string
  paymentDueDate: number
  legalRepresentativeName: string
  legalRepresentativeRole: string
  legalRepresentativeAddress: string
  legalRepresentativePhone: string
  createdAt?: Date
  updatedAt?: Date
}

function normalizeEmails(emails: string[]) {
  const normalized = emails.map((email) => email.trim().toLowerCase()).filter(Boolean)
  return Array.from(new Set(normalized))
}

function getFindOneValue<T>(result: any): T | null {
  if (!result) return null
  if (typeof result === "object" && "value" in result) return result.value as T | null
  return result as T
}

function getFindOneAndUpdateValue<T>(result: any): T | null {
  if (!result) return null
  if (typeof result === "object" && "value" in result) return result.value as T | null
  return result as T
}

export const GET = withAuth(
  async (_req: NextRequest) => {
  const col = await getCollection<SettingsDoc>("settings")
  const result = await col.findOneAndUpdate(
    { _id: SETTINGS_ID },
    {
      $setOnInsert: {
        ...DEFAULT_SETTINGS,
        notificationEmail: DEFAULT_SETTINGS.notificationEmails[0] ?? "",
      },
    },
    { upsert: true, returnDocument: "after" }
  )
  const settings = getFindOneAndUpdateValue<SettingsDoc>(result)

  return NextResponse.json({
    adminEmails: settings?.adminEmails ?? DEFAULT_SETTINGS.adminEmails,
    enableNotifications: settings?.enableNotifications ?? DEFAULT_SETTINGS.enableNotifications,
    notificationEmails:
      settings?.notificationEmails ??
      (settings?.notificationEmail ? [settings.notificationEmail] : DEFAULT_SETTINGS.notificationEmails),
    paymentDueDate: settings?.paymentDueDate ?? DEFAULT_SETTINGS.paymentDueDate,
    legalRepresentativeName:
      settings?.legalRepresentativeName ?? DEFAULT_SETTINGS.legalRepresentativeName,
    legalRepresentativeRole:
      settings?.legalRepresentativeRole ?? DEFAULT_SETTINGS.legalRepresentativeRole,
    legalRepresentativeAddress:
      settings?.legalRepresentativeAddress ?? DEFAULT_SETTINGS.legalRepresentativeAddress,
    legalRepresentativePhone:
      settings?.legalRepresentativePhone ?? DEFAULT_SETTINGS.legalRepresentativePhone,
  })
  },
  { adminOnly: true }
)

export const PUT = withAuth(
  async (req: NextRequest) => {
  const parsed = await parseJson(req, settingsSchema)
  if ("error" in parsed) return parsed.error
  const {
    adminEmails,
    enableNotifications,
    notificationEmails,
    paymentDueDate,
    legalRepresentativeName,
    legalRepresentativeRole,
    legalRepresentativeAddress,
    legalRepresentativePhone,
  } = parsed.data
  const normalizedAdminEmails = normalizeEmails(adminEmails)
  const normalizedNotificationEmails = normalizeEmails(notificationEmails)

  const col = await getCollection<SettingsDoc>("settings")
  const existingSettings = getFindOneValue<SettingsDoc>(await col.findOne({ _id: SETTINGS_ID }))
  const existingAdminEmails = normalizeEmails(existingSettings?.adminEmails ?? DEFAULT_SETTINGS.adminEmails)
  const addedAdminEmails = normalizedAdminEmails.filter((email) => !existingAdminEmails.includes(email))
  const createdFirebaseUserUids: string[] = []

  const generateBootstrapPassword = () => {
    const raw = randomBytes(12).toString("base64url")
    return `Bootstrap!${raw}`
  }

  try {
    const continueUrl = `${resolveAppOrigin(req)}/`
    for (const adminEmail of addedAdminEmails) {
      const existingFirebaseUser = await getUserByEmail(adminEmail)
      if (!existingFirebaseUser) {
        const firebaseUser = await createUserWithEmailPassword({
          email: adminEmail,
          password: generateBootstrapPassword(),
          displayName: adminEmail,
        })
        createdFirebaseUserUids.push(firebaseUser.uid)
      }

      const resetLink = await generatePasswordResetLink(adminEmail, continueUrl)
      await sendPasswordResetEmail({ to: adminEmail, link: resetLink })
    }

    await col.updateOne(
      { _id: SETTINGS_ID },
      {
        $set: {
          adminEmails: normalizedAdminEmails,
          enableNotifications,
          notificationEmails: normalizedNotificationEmails,
          // Keep legacy field for DB validator/backward compatibility.
          notificationEmail: normalizedNotificationEmails[0] ?? "",
          paymentDueDate,
          legalRepresentativeName,
          legalRepresentativeRole,
          legalRepresentativeAddress,
          legalRepresentativePhone,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true }
    )
  } catch (error) {
    for (const uid of createdFirebaseUserUids) {
      try {
        await deleteUserByUid(uid)
      } catch {
        // Preserve original error and avoid masking with cleanup failures.
      }
    }
    throw error
  }

  return NextResponse.json({
    adminEmails: normalizedAdminEmails,
    enableNotifications,
    notificationEmails: normalizedNotificationEmails,
    paymentDueDate,
    legalRepresentativeName,
    legalRepresentativeRole,
    legalRepresentativeAddress,
    legalRepresentativePhone,
  })
  },
  { adminOnly: true }
)
