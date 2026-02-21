"use client"

import { useState } from "react"
import useSWR from "swr"
import { Menu, Globe, ChevronDown, LogOut, Bell, KeyRound } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useI18n } from "@/lib/i18n-context"
import { api } from "@/lib/api-client"
import type { Contract, Payment } from "@/lib/types"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { usePathname, useRouter } from "next/navigation"
import { toast } from "sonner"

interface NavbarProps {
  onToggleSidebar: () => void
}

export function Navbar({ onToggleSidebar }: NavbarProps) {
  const { user, logout, isAdmin, sendPasswordReset } = useAuth()
  const { locale, setLocale, t } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const { data: pendingPayments = [] } = useSWR<Payment[]>(
    isAdmin ? ["payments", { state: "pending" }] : null,
    () => api.getPayments({ state: "pending" }),
    { refreshInterval: 15000 }
  )
  const { data: contracts = [] } = useSWR<Contract[]>(
    "contracts",
    api.getContracts,
    { refreshInterval: 15000 }
  )

  const displayName = user?.name?.trim() || user?.email || "Usuario"
  const roleLabel = user?.role === "admin" ? "Admin" : "Tenant"
  const tenantContractsReady = contracts.filter(
    (contract) => contract.status === "ready_to_sign" && !!contract.pdfUrl
  )
  const adminSignedContracts = contracts.filter(
    (contract) => contract.status === "signed" && !!contract.signedPdfUrl
  )
  const adminNotifications = isAdmin
    ? [
        ...adminSignedContracts.map((contract) => ({
          id: `contract-${contract.id}`,
          kind: "contract" as const,
          contract,
        })),
        ...pendingPayments.map((payment) => ({
          id: `payment-${payment.id}`,
          kind: "payment" as const,
          payment,
        })),
      ]
    : []
  const pendingCount = isAdmin ? adminNotifications.length : tenantContractsReady.length
  const [loggingOut, setLoggingOut] = useState(false)
  const [resettingPassword, setResettingPassword] = useState(false)

  const navigateToNotification = (path: "/contracts" | "/payments") => {
    if (pathname !== path) {
      router.push(path)
    }
  }

  const handleLogout = async () => {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await logout()
    } catch (error) {
      console.error("Logout error:", error)
    } finally {
      setLoggingOut(false)
    }
  }

  const handleResetPassword = async () => {
    const email = user?.email?.trim()
    if (!email || resettingPassword) return

    setResettingPassword(true)
    try {
      await sendPasswordReset(email)
      toast.success(t("auth.resetEmailSent"))
    } catch (error: any) {
      const code = error?.code || ""
      if (code === "auth/user-not-found") {
        toast.success(t("auth.resetEmailSent"))
      } else if (code === "auth/invalid-email") {
        toast.error(t("auth.invalidEmail"))
      } else if (code === "auth/too-many-requests") {
        toast.error(t("auth.tooManyRequests"))
      } else {
        toast.error(t("auth.resetEmailFailed"))
      }
    } finally {
      setResettingPassword(false)
    }
  }

  return (
    <header className="flex h-14 items-center justify-between gap-2 border-b border-transparent bg-linear-to-r from-[#5e35b1] to-[#7c4ddb] px-3 text-white sm:px-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="truncate text-xs font-semibold tracking-wide sm:text-sm">
          Alteza House
        </span>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-3">
        {(isAdmin || user?.role === "tenant") && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/30"
                aria-label={
                  isAdmin
                    ? t("notifications.pendingApprovals")
                    : t("notifications.contractsReadyToSign")
                }
              >
                <Bell className="h-4.5 w-4.5" />
                {pendingCount > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </span>
                )}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={8}
                className="z-50 w-[calc(100vw-1rem)] max-w-80 rounded-lg border border-border bg-card p-2 text-card-foreground shadow-lg"
              >
                <div className="px-2 py-1.5">
                  <p className="text-sm font-semibold">
                    {isAdmin
                      ? t("notifications.pendingApprovals")
                      : t("notifications.contractsReadyToSign")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {pendingCount === 0
                      ? isAdmin
                        ? t("notifications.noPendingApprovals")
                        : t("notifications.noContractsReadyToSign")
                      : isAdmin
                        ? t("notifications.pendingApprovalsDescription")
                        : t("notifications.contractsReadyToSignDescription")}
                  </p>
                </div>
                <DropdownMenu.Separator className="my-1 h-px bg-border" />
                <div className="max-h-72 overflow-y-auto">
                  {pendingCount === 0 ? (
                    <div className="px-2 py-3 text-sm text-muted-foreground">{t("general.noData")}</div>
                  ) : (
                    (isAdmin ? adminNotifications.slice(0, 6) : tenantContractsReady.slice(0, 6)).map(
                      (item) =>
                        isAdmin ? (
                          item.kind === "contract" ? (
                            <button
                              type="button"
                              key={item.id}
                              onClick={() => navigateToNotification("/contracts")}
                              className="w-full rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                            >
                              <p className="font-medium text-card-foreground">
                                {item.contract.tenantName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {t("contracts.status.signed")} - {item.contract.startDate} -{" "}
                                {item.contract.endDate}
                              </p>
                            </button>
                          ) : (
                            <button
                              type="button"
                              key={item.id}
                              onClick={() => navigateToNotification("/payments")}
                              className="w-full rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                            >
                              <p className="font-medium text-card-foreground">
                                {item.payment.tenantName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {item.payment.houseName} - {t(`month.${item.payment.month}`)}{" "}
                                {item.payment.year}
                              </p>
                            </button>
                          )
                        ) : (
                          <button
                            type="button"
                            key={(item as Contract).id}
                            onClick={() => navigateToNotification("/contracts")}
                            className="w-full rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                          >
                            <p className="font-medium text-card-foreground">
                              {t("contracts.status.readyToSign")}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(item as Contract).startDate} - {(item as Contract).endDate}
                            </p>
                          </button>
                        )
                    )
                  )}
                </div>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
        <button
          type="button"
          onClick={() => setLocale(locale === "es" ? "en" : "es")}
          className="flex h-8 items-center gap-1 rounded-full bg-white/10 px-2 text-[11px] font-medium uppercase tracking-wide transition-colors hover:bg-white/20 sm:gap-1.5 sm:px-3 sm:text-xs"
          aria-label="Switch language"
        >
          <Globe className="h-3.5 w-3.5" />
          {locale}
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full px-2 py-1 transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/30"
              aria-label="User menu"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/50 bg-white/20 text-xs font-bold">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <span className="hidden max-w-28 truncate text-xs font-medium opacity-90 sm:inline">
                {displayName}
              </span>
              <ChevronDown className="h-4 w-4 opacity-80" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className="z-50 min-w-56 rounded-lg border border-border bg-card p-1 text-card-foreground shadow-lg"
            >
              <div className="px-3 py-2">
                <div className="text-sm font-semibold">{displayName}</div>
                {user?.email && <div className="text-xs text-muted-foreground">{user.email}</div>}
                <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{roleLabel}</div>
              </div>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item
                onSelect={() => void handleResetPassword()}
                disabled={resettingPassword || !user?.email}
                className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none transition-colors hover:bg-muted focus:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                <KeyRound className="h-4 w-4" />
                {resettingPassword ? t("general.loading") : t("auth.resetTitle")}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => void handleLogout()}
                disabled={loggingOut}
                className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none transition-colors hover:bg-muted focus:bg-muted"
              >
                <LogOut className="h-4 w-4" />
                {loggingOut ? t("general.loading") : t("auth.logout")}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  )
}
