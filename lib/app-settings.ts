import type { Settings } from "@/lib/types"
import { getCollection } from "@/lib/mongodb"

export const SETTINGS_ID = "app-settings"

// Bootstrap admins that should always be treated as admin users.
// This prevents lock-outs if the DB settings document is missing/outdated.
export const BOOTSTRAP_ADMIN_EMAILS = ["andres@alteza.pro", "angela@alteza.pro"]

export const DEFAULT_SETTINGS: Settings = {
  adminEmails: [...BOOTSTRAP_ADMIN_EMAILS],
  enableNotifications: true,
  notificationEmails: [],
  paymentDueDate: 5,
  legalRepresentativeName: "Andres Jose Sebastian Rincon Gonzalez",
  legalRepresentativeRole: "Representante legal Alteza Enterprise SAS",
  legalRepresentativeAddress: "Dg 67 N 1a - 74 Apto 406 Torre B2",
  legalRepresentativePhone: "300 789 4833",
}

function normalizeEmails(emails: string[]) {
  const normalized = emails.map((e) => e.trim().toLowerCase()).filter(Boolean)
  return Array.from(new Set(normalized))
}

type SettingsDoc = {
  _id: string
  adminEmails?: string[]
  enableNotifications?: boolean
  notificationEmails?: string[]
  notificationEmail?: string
  paymentDueDate?: number
  legalRepresentativeName?: string
  legalRepresentativeRole?: string
  legalRepresentativeAddress?: string
  legalRepresentativePhone?: string
}

export async function getAppSettings(): Promise<Settings> {
  const settingsCol = await getCollection<SettingsDoc>("settings")
  const settings = await settingsCol.findOne({ _id: SETTINGS_ID })

  const adminEmails = normalizeEmails([
    ...(Array.isArray(settings?.adminEmails) ? settings.adminEmails : DEFAULT_SETTINGS.adminEmails),
    ...BOOTSTRAP_ADMIN_EMAILS,
  ])
  const notificationEmails = normalizeEmails(
    Array.isArray(settings?.notificationEmails)
      ? settings.notificationEmails
      : typeof settings?.notificationEmail === "string"
        ? [settings.notificationEmail]
        : DEFAULT_SETTINGS.notificationEmails
  )

  return {
    adminEmails,
    enableNotifications: settings?.enableNotifications ?? DEFAULT_SETTINGS.enableNotifications,
    notificationEmails,
    paymentDueDate: settings?.paymentDueDate ?? DEFAULT_SETTINGS.paymentDueDate,
    legalRepresentativeName: settings?.legalRepresentativeName ?? DEFAULT_SETTINGS.legalRepresentativeName,
    legalRepresentativeRole: settings?.legalRepresentativeRole ?? DEFAULT_SETTINGS.legalRepresentativeRole,
    legalRepresentativeAddress: settings?.legalRepresentativeAddress ?? DEFAULT_SETTINGS.legalRepresentativeAddress,
    legalRepresentativePhone: settings?.legalRepresentativePhone ?? DEFAULT_SETTINGS.legalRepresentativePhone,
  }
}

export async function getAdminEmails(): Promise<string[]> {
  const settings = await getAppSettings()
  return settings.adminEmails
}

