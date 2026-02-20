"use client"

import { useState } from "react"
import useSWR from "swr"
import { useI18n } from "@/lib/i18n-context"
import { api } from "@/lib/api-client"
import type { Settings } from "@/lib/types"
import { Save, X, Plus } from "lucide-react"
import { toast } from "sonner"

const defaultSettings: Settings = {
  adminEmails: ["andres@alteza.pro", "angela@alteza.pro"],
  enableNotifications: true,
  notificationEmails: [],
  paymentDueDate: 5,
  legalRepresentativeName: "Andres Jose Sebastian Rincon Gonzalez",
  legalRepresentativeRole: "Representante legal Alteza Enterprise SAS",
  legalRepresentativeAddress: "Dg 67 N 1a - 74 Apto 406 Torre B2",
  legalRepresentativePhone: "300 789 4833",
}

export function SettingsPage() {
  const { t } = useI18n()
  const { data: serverSettings, mutate } = useSWR<Settings>("settings", api.getSettings)
  const settings = serverSettings || defaultSettings
  const [localSettings, setLocalSettings] = useState<Settings | null>(null)
  const [newEmail, setNewEmail] = useState("")
  const [newNotificationEmail, setNewNotificationEmail] = useState("")
  const [saving, setSaving] = useState(false)

  // Use local state if user has made changes, otherwise use server
  const currentSettings = localSettings || settings

  const inputClass =
    "rounded-lg border border-input bg-card px-4 py-2.5 text-sm text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"

  const updateLocal = (updates: Partial<Settings>) => {
    setLocalSettings({ ...currentSettings, ...updates })
  }

  const addEmail = () => {
    const normalizedEmail = newEmail.trim()

    if (!normalizedEmail) {
      toast.error(t("settings.emailRequired"))
      return
    }

    if (currentSettings.adminEmails.includes(normalizedEmail)) {
      toast.error(t("settings.emailAlreadyExists"))
      return
    }

    if (!normalizedEmail.includes("@")) {
      toast.error(t("settings.emailInvalid"))
      return
    }

    if (normalizedEmail) {
      updateLocal({
        adminEmails: [...currentSettings.adminEmails, normalizedEmail],
      })
      setNewEmail("")
    }
  }

  const removeEmail = (email: string) => {
    updateLocal({
      adminEmails: currentSettings.adminEmails.filter((e) => e !== email),
    })
  }

  const addNotificationEmail = () => {
    const normalizedEmail = newNotificationEmail.trim()

    if (!normalizedEmail) {
      toast.error(t("settings.emailRequired"))
      return
    }

    if (currentSettings.notificationEmails.includes(normalizedEmail)) {
      toast.error(t("settings.emailAlreadyExists"))
      return
    }

    if (!normalizedEmail.includes("@")) {
      toast.error(t("settings.emailInvalid"))
      return
    }

    updateLocal({
      notificationEmails: [...currentSettings.notificationEmails, normalizedEmail],
    })
    setNewNotificationEmail("")
  }

  const removeNotificationEmail = (email: string) => {
    updateLocal({
      notificationEmails: currentSettings.notificationEmails.filter((e) => e !== email),
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.updateSettings(currentSettings)
      await mutate()
      setLocalSettings(null)
      toast.success(t("settings.savedSuccess"))
    } catch (err) {
      console.error("Save error:", err)
      toast.error(t("settings.saveError"))
    } finally {
      setSaving(false)
    }
  }

  const renderSaveButton = () => (
    <div className="flex justify-end pt-2">
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        {saving ? t("general.loading") : t("general.save")}
      </button>
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold text-foreground">{t("settings.title")}</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Admin Emails */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-base font-bold text-card-foreground">{t("settings.adminEmails")}</h2>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {currentSettings.adminEmails.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                >
                  {email}
                  <button
                    type="button"
                    onClick={() => removeEmail(email)}
                    className="rounded-full p-0.5 transition-colors hover:bg-primary/20"
                    aria-label={`Remove ${email}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="nuevo@correo.com"
                className={`w-full flex-1 ${inputClass}`}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEmail())}
              />
              <button
                type="button"
                onClick={addEmail}
                className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-base font-bold text-card-foreground">{t("settings.notifications")}</h2>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-card-foreground">
                {t("settings.enableNotifications")}
              </label>
              <button
                type="button"
                onClick={() =>
                  updateLocal({
                    enableNotifications: !currentSettings.enableNotifications,
                  })
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  currentSettings.enableNotifications ? "bg-primary" : "bg-muted"
                }`}
                role="switch"
                aria-checked={currentSettings.enableNotifications}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    currentSettings.enableNotifications ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-card-foreground">
                {t("settings.notificationEmail")}
              </label>
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  {currentSettings.notificationEmails.map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                    >
                      {email}
                      <button
                        type="button"
                        onClick={() => removeNotificationEmail(email)}
                        className="rounded-full p-0.5 transition-colors hover:bg-primary/20"
                        aria-label={`Remove ${email}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="email"
                    value={newNotificationEmail}
                    onChange={(e) => setNewNotificationEmail(e.target.value)}
                    placeholder="nuevo@correo.com"
                    className={`w-full flex-1 ${inputClass}`}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNotificationEmail())}
                  />
                  <button
                    type="button"
                    onClick={addNotificationEmail}
                    className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-card-foreground">
                {t("settings.dueDate")} <span className="text-destructive">*</span>
              </label>
              <input
                type="number"
                min={1}
                max={28}
                value={currentSettings.paymentDueDate}
                onChange={(e) =>
                  updateLocal({ paymentDueDate: Number(e.target.value) })
                }
                className={inputClass}
                required
              />
            </div>
            {renderSaveButton()}
          </div>
        </div>

        {/* Receipt Issuer Settings */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-base font-bold text-card-foreground">{t("settings.receiptIssuer")}</h2>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-card-foreground">
                {t("settings.legalRepresentativeName")} <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={currentSettings.legalRepresentativeName}
                onChange={(e) =>
                  updateLocal({ legalRepresentativeName: e.target.value })
                }
                className={inputClass}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-card-foreground">
                {t("settings.legalRepresentativeRole")} <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={currentSettings.legalRepresentativeRole}
                onChange={(e) =>
                  updateLocal({ legalRepresentativeRole: e.target.value })
                }
                className={inputClass}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-card-foreground">
                {t("settings.legalRepresentativeAddress")} <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={currentSettings.legalRepresentativeAddress}
                onChange={(e) =>
                  updateLocal({ legalRepresentativeAddress: e.target.value })
                }
                className={inputClass}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-card-foreground">
                {t("settings.legalRepresentativePhone")} <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={currentSettings.legalRepresentativePhone}
                onChange={(e) =>
                  updateLocal({ legalRepresentativePhone: e.target.value })
                }
                className={inputClass}
                required
              />
            </div>
            {renderSaveButton()}
          </div>
        </div>
      </div>

    </div>
  )
}
