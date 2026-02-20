"use client"

import { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { useI18n } from "@/lib/i18n-context"
import { Navbar } from "@/components/navbar"
import { Sidebar } from "@/components/sidebar"
import { LoginPage } from "@/components/pages/login-page"
import { DashboardPage } from "@/components/pages/dashboard-page"
import { HousesPage } from "@/components/pages/houses-page"
import { TenantsPage } from "@/components/pages/tenants-page"
import { ContractsPage } from "@/components/pages/contracts-page"
import { PaymentsPage } from "@/components/pages/payments-page"
import { ReceiptsPage } from "@/components/pages/receipts-page"
import { PaymentsReportPage } from "@/components/pages/payments-report-page"

import { SettingsPage } from "@/components/pages/settings-page"
import { cn } from "@/lib/utils"
import { Toaster } from "sonner"

const PAGE_IDS = [
  "dashboard",
  "houses",
  "tenants",
  "contracts",
  "payments",
  "receipts",
  "reports-paid",
  "reports-unpaid",
  "settings",
] as const

type PageId = (typeof PAGE_IDS)[number]

const VALID_PAGE_IDS = new Set<string>(PAGE_IDS)

export function AppShell() {
  const { isAuthenticated, loading } = useAuth()
  const { t } = useI18n()
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  const currentSegment = pathname.split("/").filter(Boolean)[0]
  const currentPage: PageId =
    !currentSegment || currentSegment === "dashboard"
      ? "dashboard"
      : VALID_PAGE_IDS.has(currentSegment)
        ? (currentSegment as PageId)
        : "dashboard"

  const navigateToPage = (page: string) => {
    const targetPath = page === "dashboard" ? "/" : `/${page}`
    if (targetPath !== pathname) {
      router.push(targetPath)
    }
    setMobileSidebarOpen(false)
  }

  const handleToggleSidebar = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileSidebarOpen((prev) => !prev)
      return
    }
    setSidebarOpen((prev) => !prev)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-[#5e35b1] via-[#7c4ddb] to-[#9c6fef]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/30 border-t-white" />
          <p className="text-sm font-medium text-white">{t("general.loading")}...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage />
  }

  const renderPage = () => {
    switch (currentPage) {
      case "dashboard":
        return <DashboardPage />
      case "houses":
        return <HousesPage />
      case "tenants":
        return <TenantsPage />
      case "contracts":
        return <ContractsPage />
      case "payments":
        return <PaymentsPage />
      case "receipts":
        return <ReceiptsPage />
      case "reports-paid":
        return <PaymentsReportPage reportState="approved" />
      case "reports-unpaid":
        return <PaymentsReportPage reportState="pending" />
      case "settings":
        return <SettingsPage />
      default:
        return <DashboardPage />
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar onToggleSidebar={handleToggleSidebar} />
      <div className="relative flex flex-1">
        {mobileSidebarOpen && (
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={() => setMobileSidebarOpen(false)}
            className="fixed inset-0 top-14 z-20 bg-black/40 lg:hidden"
          />
        )}
        <Sidebar
          isOpen={sidebarOpen}
          mobileOpen={mobileSidebarOpen}
          currentPage={currentPage}
          onNavigate={navigateToPage}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />
        <main
          className={cn(
            "min-w-0 flex-1 transition-all duration-300",
            sidebarOpen ? "lg:ml-56" : "lg:ml-16"
          )}
        >
          <div className="min-h-[calc(100vh-3.5rem-3rem)] px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
            {renderPage()}
          </div>
          <footer className="border-t border-border px-4 py-3 text-center text-xs text-muted-foreground sm:px-6">
            &copy; {new Date().getFullYear()} {t("app.footer")}
          </footer>
        </main>
      </div>
      <Toaster richColors position="top-right" />
    </div>
  )
}
