import { NextRequest, NextResponse } from "next/server"
import { getCollection } from "@/lib/mongodb"
import { withAuth } from "@/lib/api-auth"
import { DEFAULT_SETTINGS, SETTINGS_ID } from "@/lib/app-settings"
import { parseJson } from "@/lib/api-helpers"
import { settingsSchema } from "@/lib/schemas/settings"

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

  const col = await getCollection<SettingsDoc>("settings")
  await col.updateOne(
    { _id: SETTINGS_ID },
    {
      $set: {
        adminEmails,
        enableNotifications,
        notificationEmails,
        // Keep legacy field for DB validator/backward compatibility.
        notificationEmail: notificationEmails[0] ?? "",
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

  return NextResponse.json({
    adminEmails,
    enableNotifications,
    notificationEmails,
    paymentDueDate,
    legalRepresentativeName,
    legalRepresentativeRole,
    legalRepresentativeAddress,
    legalRepresentativePhone,
  })
  },
  { adminOnly: true }
)
