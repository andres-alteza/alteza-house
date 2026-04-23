"use client"

import useSWR from "swr"
import { useI18n } from "@/lib/i18n-context"
import { useAuth } from "@/lib/auth-context"
import { api } from "@/lib/api-client"
import type { Contract, House, Payment, Tenant } from "@/lib/types"
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  Clock,
  CreditCard,
  Download,
  FileText,
  Home,
  Loader2,
  Users,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

const DEFAULT_PAYMENT_DUE_DAY = 5

function toLocalIsoDate(date: Date) {
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localTime.toISOString().slice(0, 10)
}

function getNextDueDate(paymentDueDay: number, reference: Date) {
  const candidate = new Date(reference.getFullYear(), reference.getMonth(), paymentDueDay)
  if (candidate < reference) {
    candidate.setMonth(candidate.getMonth() + 1)
  }
  return candidate
}

export function DashboardPage() {
  const { isAdmin, user } = useAuth()
  const router = useRouter()

  const { data: houses = [] } = useSWR<House[]>(isAdmin ? "houses" : null, api.getHouses)
  const { data: tenants = [] } = useSWR<Tenant[]>("tenants", api.getTenants)
  const { data: contracts = [] } = useSWR<Contract[]>("contracts", api.getContracts)
  const { data: payments = [] } = useSWR<Payment[]>("payments", () => api.getPayments())
  const { data: publicSettings } = useSWR<{ paymentDueDate: number }>(
    !isAdmin ? "/api/settings/public" : null,
    api.getPublicSettings
  )

  const activeContracts = contracts.filter(
    (c) => new Date(c.endDate) >= new Date()
  )
  const pendingPayments = payments.filter((p) => p.state === "pending")

  if (isAdmin) {
    return (
      <AdminDashboard
        houses={houses}
        tenants={tenants}
        activeContracts={activeContracts}
        pendingPayments={pendingPayments}
        payments={payments}
      />
    )
  }

  return (
    <TenantDashboard
      user={user}
      tenants={tenants}
      contracts={contracts}
      payments={payments}
      paymentDueDay={publicSettings?.paymentDueDate ?? DEFAULT_PAYMENT_DUE_DAY}
      onNavigate={(path) => router.push(path)}
    />
  )
}

function AdminDashboard({
  houses,
  tenants,
  activeContracts,
  pendingPayments,
  payments,
}: {
  houses: House[]
  tenants: Tenant[]
  activeContracts: Contract[]
  pendingPayments: Payment[]
  payments: Payment[]
}) {
  const { t } = useI18n()
  const router = useRouter()

  const adminStats = [
    {
      label: t("dashboard.totalHouses"),
      value: houses.length,
      icon: <Home className="h-6 w-6" />,
      color: "bg-primary/10 text-primary",
      path: "/houses",
    },
    {
      label: t("dashboard.totalTenants"),
      value: tenants.length,
      icon: <Users className="h-6 w-6" />,
      color: "bg-accent/10 text-accent",
      path: "/tenants",
    },
    {
      label: t("dashboard.activeContracts"),
      value: activeContracts.length,
      icon: <FileText className="h-6 w-6" />,
      color: "bg-success/10 text-success",
      path: "/contracts",
    },
    {
      label: t("dashboard.pendingPayments"),
      value: pendingPayments.length,
      icon: <CreditCard className="h-6 w-6" />,
      color: "bg-warning/10 text-warning",
      path: "/payments",
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold text-foreground">{t("dashboard.title")}</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {adminStats.map((stat) => (
          <button
            key={stat.label}
            type="button"
            onClick={() => router.push(stat.path)}
            className="flex items-center gap-4 rounded-xl border border-border bg-card p-5 text-left transition-all hover:border-primary/30 hover:bg-muted/30"
          >
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.color}`}>
              {stat.icon}
            </div>
            <div>
              <p className="text-2xl font-bold text-card-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div
          className="rounded-xl border border-border bg-card p-5"
          role="button"
          tabIndex={0}
          onClick={() => router.push("/payments")}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault()
              router.push("/payments")
            }
          }}
        >
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold text-card-foreground">{t("dashboard.recentPayments")}</h2>
          </div>
          <div className="flex flex-col gap-3">
            {payments.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{t("general.noData")}</p>
            ) : (
              payments.slice(0, 5).map((payment) => (
                <button
                  key={payment.id}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    router.push("/payments")
                  }}
                  className="flex w-full flex-col gap-2 rounded-lg border border-border/50 px-4 py-3 text-left transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-card-foreground">{payment.tenantName}</p>
                    <p className="text-xs text-muted-foreground">
                      {payment.houseName} - {t(`month.${payment.month}`)} {payment.year}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <span className="text-sm font-semibold text-card-foreground">
                      ${payment.amount.toLocaleString()}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        payment.state === "approved"
                          ? "bg-success/10 text-success"
                          : "bg-warning/10 text-warning"
                      }`}
                    >
                      {payment.state === "approved" ? t("payments.approved") : t("payments.pending")}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div
          className="rounded-xl border border-border bg-card p-5"
          role="button"
          tabIndex={0}
          onClick={() => router.push("/payments")}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault()
              router.push("/payments")
            }
          }}
        >
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <h2 className="text-base font-bold text-card-foreground">{t("dashboard.pendingPayments")}</h2>
          </div>
          <div className="flex flex-col gap-3">
            {pendingPayments.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{t("general.noData")}</p>
            ) : (
              pendingPayments.map((payment) => (
                <button
                  key={payment.id}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    router.push("/payments")
                  }}
                  className="flex w-full flex-col gap-2 rounded-lg border border-warning/20 bg-warning/5 px-4 py-3 text-left transition-colors hover:bg-warning/10 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-card-foreground">{payment.tenantName}</p>
                    <p className="text-xs text-muted-foreground">
                      {payment.houseName} - {t(`month.${payment.month}`)} {payment.year}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-warning">
                    ${payment.amount.toLocaleString()}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function TenantDashboard({
  user,
  tenants,
  contracts,
  payments,
  paymentDueDay,
  onNavigate,
}: {
  user: { name: string; email: string } | null
  tenants: Tenant[]
  contracts: Contract[]
  payments: Payment[]
  paymentDueDay: number
  onNavigate: (path: string) => void
}) {
  const { t } = useI18n()
  const [openingProofId, setOpeningProofId] = useState<string | null>(null)

  const tenantProfile = tenants[0]
  const now = new Date()
  const localToday = toLocalIsoDate(now)
  const activeContract = contracts.find(
    (contract) =>
      contract.tenantId === tenantProfile?.id &&
      contract.status === "approved" &&
      contract.startDate <= localToday &&
      contract.endDate >= localToday
  )

  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()
  const currentMonthPayment = payments.find(
    (payment) =>
      payment.contractId === activeContract?.id &&
      payment.month === currentMonth &&
      payment.year === currentYear
  )
  const isCurrentMonthApproved = currentMonthPayment?.state === "approved"

  const today = now.getDate()
  const isOverdue = today > paymentDueDay
  const showReminder = !!activeContract && !isCurrentMonthApproved && isOverdue

  const upcomingReference = showReminder
    ? new Date(now.getFullYear(), now.getMonth() + 1, 1)
    : now
  const nextDueDate = getNextDueDate(paymentDueDay, upcomingReference)
  const nextDueMonthIndex = nextDueDate.getMonth() + 1
  const nextDueYear = nextDueDate.getFullYear()
  const nextDueLabel = `${nextDueDate.getDate()} de ${t(`month.${nextDueMonthIndex}`).toLowerCase()}`
  const nextPaymentExisting = payments.find(
    (payment) =>
      payment.contractId === activeContract?.id &&
      payment.month === nextDueMonthIndex &&
      payment.year === nextDueYear
  )
  const isNextPaymentApproved = nextPaymentExisting?.state === "approved"
  const showNextPayment = !!activeContract && !isNextPaymentApproved

  const sortedPayments = [...payments].sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year
    return b.month - a.month
  })

  const greetingName = (user?.name?.trim().split(" ")[0] || user?.email || "").trim()

  const openProofFile = async (paymentId: string) => {
    if (openingProofId) return
    setOpeningProofId(paymentId)
    try {
      const data = await api.getPaymentProofUrl(paymentId)
      const response = await fetch(data.url)
      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}`)
      }
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = objectUrl
      anchor.download = `payment-proof-${paymentId}`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000)
      toast.success(t("general.openedSuccess"))
    } catch (error) {
      console.error("Open payment proof error:", error)
      toast.error(t("payments.openProofError"))
    } finally {
      setOpeningProofId(null)
    }
  }

  const reminderAmount = activeContract?.monthlyPrice ?? 0
  const reminderBody = t("dashboard.paymentReminderBody").replace(
    "{name}",
    greetingName || ""
  )
  const dueDateLabel = `${paymentDueDay} de ${t(`month.${currentMonth}`).toLowerCase()}`

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold text-foreground">
          {t("dashboard.greeting")}, {greetingName}
        </h1>
        <span aria-hidden className="text-2xl">
          👋
        </span>
      </div>

      {showReminder && (
        <div className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/5 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-1 flex-col gap-2">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-warning" />
              <h3 className="text-base font-bold text-card-foreground">
                {t("dashboard.paymentReminderTitle")}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">{reminderBody}</p>
            <p className="text-sm text-card-foreground">
              <span className="font-semibold">{t("dashboard.paymentReminderAmount")}:</span> $
              {reminderAmount.toLocaleString()}{" "}
              <span className="mx-2 text-muted-foreground">|</span>
              <span className="font-semibold">{t("dashboard.paymentReminderDueDate")}:</span>{" "}
              <span className="font-semibold">{dueDateLabel}</span>
            </p>
            <p className="text-xs text-muted-foreground">{t("dashboard.paymentReminderFooter")}</p>
          </div>
          {currentMonthPayment?.state === "approved" && (
            <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-success px-3 py-1 text-xs font-semibold text-success-foreground">
              <CheckCircle className="h-3.5 w-3.5" />
              {t("dashboard.proofApproved")}
            </span>
          )}
        </div>
      )}

      {showNextPayment && (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <h3 className="text-base font-bold text-card-foreground">
                {t("dashboard.nextPaymentTitle")}
              </h3>
            </div>
            <p className="text-2xl font-bold text-card-foreground">
              ${reminderAmount.toLocaleString()}
            </p>
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-card-foreground">
                {t("dashboard.dueLabel")}:
              </span>{" "}
              {nextDueLabel}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold text-card-foreground">
              {t("dashboard.paymentHistoryTitle")}
            </h2>
          </div>
        </div>

        {sortedPayments.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-muted-foreground">
            {t("general.noData")}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3">{t("dashboard.dateLabel")}</th>
                    <th className="px-5 py-3">{t("dashboard.concept")}</th>
                    <th className="px-5 py-3">{t("payments.amount")}</th>
                    <th className="px-5 py-3">{t("payments.state")}</th>
                    <th className="px-5 py-3">{t("dashboard.receipt")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPayments.slice(0, 5).map((payment) => {
                    const monthLabel = t(`month.${payment.month}`)
                    return (
                      <tr key={payment.id} className="border-t border-border/50">
                        <td className="px-5 py-3 text-card-foreground">
                          {paymentDueDay} de {monthLabel.toLowerCase()}
                        </td>
                        <td className="px-5 py-3 text-card-foreground">
                          {t("dashboard.rentForMonth").replace("{month}", monthLabel)}
                        </td>
                        <td className="px-5 py-3 text-card-foreground">
                          ${payment.amount.toLocaleString()}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                              payment.state === "approved"
                                ? "bg-success/10 text-success"
                                : "bg-warning/10 text-warning"
                            }`}
                          >
                            {payment.state === "approved" && <CheckCircle className="h-3 w-3" />}
                            {payment.state === "approved"
                              ? t("dashboard.paid")
                              : t("payments.pending")}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <button
                            type="button"
                            onClick={() => void openProofFile(payment.id)}
                            disabled={!payment.proofImageUrl || openingProofId === payment.id}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-card-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {openingProofId === payment.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Download className="h-3 w-3" />
                            )}
                            {t("dashboard.view")}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border px-5 py-3 text-center">
              <button
                type="button"
                onClick={() => onNavigate("/payments")}
                className="text-xs font-medium text-primary transition-colors hover:underline"
              >
                {t("dashboard.viewAllPayments")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
