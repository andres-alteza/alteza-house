"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { Loader2, Download, ChevronDown, Mail, Plus, X } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { Modal } from "@/components/modal"
import { useI18n } from "@/lib/i18n-context"
import { useAuth } from "@/lib/auth-context"
import { api } from "@/lib/api-client"
import type { House, Tenant } from "@/lib/types"

function buildReportFilename(filters: {
  houseLabel?: string
  tenantLabel?: string
  year?: string
  month?: string
  state?: string
}) {
  const chunks = ["payments-report"]
  if (filters.houseLabel) chunks.push(filters.houseLabel.replace(/\s+/g, "-").toLowerCase())
  if (filters.tenantLabel) chunks.push(filters.tenantLabel.replace(/\s+/g, "-").toLowerCase())
  if (filters.year) chunks.push(filters.year)
  if (filters.month) chunks.push(`m${filters.month}`)
  if (filters.state && filters.state !== "all") chunks.push(filters.state)
  return `${chunks.join("-")}.pdf`
}

export function PaymentsReportPage({ reportState }: { reportState: "approved" | "pending" }) {
  const { t } = useI18n()
  const { isAdmin } = useAuth()
  const { data: houses = [] } = useSWR<House[]>("houses", api.getHouses)
  const { data: tenants = [] } = useSWR<Tenant[]>("tenants", api.getTenants)

  const [selectedHouseId, setSelectedHouseId] = useState("")
  const [selectedTenantId, setSelectedTenantId] = useState("")
  const [selectedYear, setSelectedYear] = useState("")
  const [selectedMonth, setSelectedMonth] = useState("")
  const [downloading, setDownloading] = useState(false)
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [emails, setEmails] = useState<string[]>([])
  const [sendingEmail, setSendingEmail] = useState(false)

  const currentYear = new Date().getFullYear()
  const yearOptions = useMemo(
    () => [currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map(String),
    [currentYear]
  )

  const houseTenants = useMemo(() => {
    if (!selectedHouseId) return tenants
    return tenants.filter((tenant) => tenant.houseId === selectedHouseId)
  }, [tenants, selectedHouseId])

  const selectedHouse = houses.find((house) => house.id === selectedHouseId)
  const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId)

  const inputClass =
    "rounded-lg border border-input bg-card px-4 py-2.5 text-sm text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
  const selectClass = `${inputClass} w-full appearance-none pr-10`

  const onHouseChange = (houseId: string) => {
    setSelectedHouseId(houseId)
    if (!houseId) return
    if (selectedTenantId && !tenants.some((tenant) => tenant.id === selectedTenantId && tenant.houseId === houseId)) {
      setSelectedTenantId("")
    }
  }

  const generateReport = async () => {
    if (!isAdmin || downloading) return
    setDownloading(true)
    try {
      const blob = await api.getPaymentsReportPdf({
        houseId: selectedHouseId || undefined,
        tenantId: selectedTenantId || undefined,
        year: selectedYear || undefined,
        month: selectedMonth || undefined,
        state: reportState,
      })

      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = objectUrl
      anchor.download = buildReportFilename({
        houseLabel: selectedHouse?.name,
        tenantLabel: selectedTenant?.name,
        year: selectedYear,
        month: selectedMonth,
        state: reportState,
      })
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000)
      toast.success(t("reports.downloadSuccess"))
    } catch (error) {
      console.error("Generate payments report error:", error)
      toast.error(t("reports.downloadError"))
    } finally {
      setDownloading(false)
    }
  }

  const addEmail = () => {
    const normalizedEmail = newEmail.trim().toLowerCase()
    if (!normalizedEmail) {
      toast.error(t("reports.emailRequired"))
      return
    }
    if (!normalizedEmail.includes("@")) {
      toast.error(t("settings.emailInvalid"))
      return
    }
    if (emails.includes(normalizedEmail)) {
      toast.error(t("settings.emailAlreadyExists"))
      return
    }
    setEmails((prev) => [...prev, normalizedEmail])
    setNewEmail("")
  }

  const removeEmail = (emailToRemove: string) => {
    setEmails((prev) => prev.filter((email) => email !== emailToRemove))
  }

  const sendReportByEmail = async () => {
    if (!isAdmin || sendingEmail) return

    let nextEmails = emails
    const pendingEmail = newEmail.trim().toLowerCase()
    if (pendingEmail) {
      if (!pendingEmail.includes("@")) {
        toast.error(t("settings.emailInvalid"))
        return
      }
      if (!emails.includes(pendingEmail)) {
        nextEmails = [...emails, pendingEmail]
        setEmails(nextEmails)
      }
      setNewEmail("")
    }

    if (nextEmails.length === 0) {
      toast.error(t("reports.emailRequired"))
      return
    }

    setSendingEmail(true)
    try {
      await api.sendPaymentsReportEmail({
        houseId: selectedHouseId || undefined,
        tenantId: selectedTenantId || undefined,
        year: selectedYear || undefined,
        month: selectedMonth || undefined,
        state: reportState,
        emails: nextEmails,
      })
      toast.success(t("reports.emailSuccess"))
      setIsEmailModalOpen(false)
      setNewEmail("")
      setEmails([])
    } catch (error) {
      console.error("Send payments report email error:", error)
      toast.error(t("reports.emailError"))
    } finally {
      setSendingEmail(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("reports.paymentsTitle")} />
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          {t("reports.adminOnly")}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={reportState === "approved" ? t("reports.paidTitle") : t("reports.unpaidTitle")}
      />
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t("reports.house")}</label>
            <div className="relative">
              <select
                value={selectedHouseId}
                onChange={(e) => onHouseChange(e.target.value)}
                className={selectClass}
              >
                <option value="">{t("reports.allHouses")}</option>
                {houses.map((house) => (
                  <option key={house.id} value={house.id}>
                    {house.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t("reports.tenant")}</label>
            <div className="relative">
              <select
                value={selectedTenantId}
                onChange={(e) => setSelectedTenantId(e.target.value)}
                className={selectClass}
              >
                <option value="">{t("reports.allTenants")}</option>
                {houseTenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t("reports.year")}</label>
            <div className="relative">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className={selectClass}
              >
                <option value="">{t("reports.allYears")}</option>
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t("reports.month")}</label>
            <div className="relative">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className={selectClass}
              >
                <option value="">{t("reports.allMonths")}</option>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={String(i + 1)}>
                    {t(`month.${i + 1}`)}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void generateReport()}
            disabled={downloading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 md:w-auto"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {downloading ? t("general.loading") : t("reports.generatePdf")}
          </button>
          <button
            type="button"
            onClick={() => setIsEmailModalOpen(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-input bg-card px-4 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-accent disabled:opacity-50 md:w-auto"
          >
            <Mail className="h-4 w-4" />
            {t("reports.sendEmail")}
          </button>
        </div>
      </div>

      <Modal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        title={t("reports.sendEmailModalTitle")}
        size="md"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {emails.map((email) => (
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
              placeholder={t("reports.emailPlaceholder")}
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
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setIsEmailModalOpen(false)}
              className="inline-flex items-center justify-center rounded-lg border border-input bg-card px-4 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-accent"
            >
              {t("general.cancel")}
            </button>
            <button
              type="button"
              onClick={() => void sendReportByEmail()}
              disabled={sendingEmail}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {sendingEmail ? t("general.loading") : t("reports.sendEmail")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
