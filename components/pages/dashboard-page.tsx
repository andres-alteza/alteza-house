"use client"

import useSWR from "swr"
import { useI18n } from "@/lib/i18n-context"
import { useAuth } from "@/lib/auth-context"
import { api } from "@/lib/api-client"
import type { House, Tenant, Contract, Payment } from "@/lib/types"
import { Home, Users, FileText, CreditCard, Clock, AlertTriangle } from "lucide-react"
import { useRouter } from "next/navigation"

export function DashboardPage() {
  const { t } = useI18n()
  const { isAdmin } = useAuth()
  const router = useRouter()

  const { data: houses = [] } = useSWR<House[]>("houses", api.getHouses)
  const { data: tenants = [] } = useSWR<Tenant[]>("tenants", api.getTenants)
  const { data: contracts = [] } = useSWR<Contract[]>("contracts", api.getContracts)
  const { data: payments = [] } = useSWR<Payment[]>("payments", () => api.getPayments())

  const activeContracts = contracts.filter(
    (c) => new Date(c.endDate) >= new Date()
  )
  const pendingPayments = payments.filter((p) => p.state === "pending")
  const approvedPayments = payments.filter((p) => p.state === "approved")

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

      {isAdmin && (
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
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Payments */}
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

        {/* Pending Payments */}
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

      {/* Quick info for tenant */}
      {!isAdmin && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => router.push("/payments")}
            className="flex items-center gap-4 rounded-xl border border-border bg-card p-5 text-left transition-all hover:border-primary/30 hover:bg-muted/30"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success/10 text-success">
              <CreditCard className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-card-foreground">{approvedPayments.length}</p>
              <p className="text-xs text-muted-foreground">{t("payments.approved")}</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => router.push("/payments")}
            className="flex items-center gap-4 rounded-xl border border-border bg-card p-5 text-left transition-all hover:border-primary/30 hover:bg-muted/30"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning/10 text-warning">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-card-foreground">{pendingPayments.length}</p>
              <p className="text-xs text-muted-foreground">{t("payments.pending")}</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => router.push("/contracts")}
            className="flex items-center gap-4 rounded-xl border border-border bg-card p-5 text-left transition-all hover:border-primary/30 hover:bg-muted/30"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-card-foreground">{activeContracts.length}</p>
              <p className="text-xs text-muted-foreground">{t("dashboard.activeContracts")}</p>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}
