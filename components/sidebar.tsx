"use client"

import React from "react"

import {
  LayoutDashboard,
  Home,
  FileText,
  CreditCard,
  BarChart3,
  Settings,
  ChevronDown,
} from "lucide-react"
import { useI18n } from "@/lib/i18n-context"
import { useAuth } from "@/lib/auth-context"
import { cn } from "@/lib/utils"
import { useState } from "react"

interface SidebarProps {
  isOpen: boolean
  mobileOpen: boolean
  currentPage: string
  onNavigate: (page: string) => void
  onCloseMobile: () => void
}

interface NavItem {
  id: string
  label: string
  icon: React.ReactNode
  children?: { id: string; label: string }[]
  adminOnly?: boolean
  tenantOnly?: boolean
}

export function Sidebar({
  isOpen,
  mobileOpen,
  currentPage,
  onNavigate,
  onCloseMobile,
}: SidebarProps) {
  const { t } = useI18n()
  const { isAdmin } = useAuth()
  const [expandedGroups, setExpandedGroups] = useState<string[]>(["management", "reports"])

  const navItems: NavItem[] = [
    {
      id: "dashboard",
      label: t("nav.dashboard"),
      icon: <LayoutDashboard className="h-5 w-5" />,
    },
    {
      id: "management",
      label: t("nav.management"),
      icon: <Home className="h-5 w-5" />,
      adminOnly: true,
      children: [
        { id: "houses", label: t("nav.houses") },
        { id: "tenants", label: t("nav.tenants") },
      ],
    },
    {
      id: "contracts",
      label: t("nav.contracts"),
      icon: <FileText className="h-5 w-5" />,
    },
    {
      id: "payments",
      label: t("nav.payments"),
      icon: <CreditCard className="h-5 w-5" />,
    },
    {
      id: "reports",
      label: t("nav.reports"),
      icon: <BarChart3 className="h-5 w-5" />,
      adminOnly: true,
      children: [
        { id: "reports-paid", label: t("nav.reportsPaid") },
        { id: "reports-unpaid", label: t("nav.reportsUnpaid") },
      ],
    },
    {
      id: "settings",
      label: t("nav.settings"),
      icon: <Settings className="h-5 w-5" />,
      adminOnly: true,
    },
  ]

  const filteredItems = navItems.filter((item) => {
    if (item.adminOnly && !isAdmin) return false
    if (item.tenantOnly && isAdmin) return false
    return true
  })

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    )
  }

  const isActive = (id: string) => currentPage === id

  return (
    <aside
      className={cn(
        "fixed left-0 top-14 z-30 flex h-[calc(100vh-3.5rem)] flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        mobileOpen ? "w-56" : isOpen ? "w-56" : "w-16"
      )}
    >
      <nav className="flex-1 overflow-y-auto px-2 py-4">
        <ul className="flex flex-col gap-1">
          {filteredItems.map((item) => (
            <li key={item.id}>
              {item.children ? (
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      if (isOpen) {
                        toggleGroup(item.id)
                      } else {
                        onNavigate(item.children![0].id)
                      }
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      item.children.some((c) => isActive(c.id))
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <span
                      className={cn(
                        "shrink-0",
                        item.children.some((c) => isActive(c.id))
                          ? "text-primary"
                          : ""
                      )}
                    >
                      {item.icon}
                    </span>
                    {isOpen && (
                      <>
                        <span className="flex-1 text-left">{item.label}</span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 transition-transform",
                            expandedGroups.includes(item.id) ? "rotate-180" : ""
                          )}
                        />
                      </>
                    )}
                  </button>
                  {isOpen && expandedGroups.includes(item.id) && (
                    <ul className="mt-1 ml-4 flex flex-col gap-0.5 border-l border-sidebar-border pl-4">
                      {item.children.map((child) => (
                        <li key={child.id}>
                          <button
                            type="button"
                            onClick={() => {
                              onNavigate(child.id)
                              onCloseMobile()
                            }}
                            className={cn(
                              "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                              isActive(child.id)
                                ? "bg-primary/10 font-semibold text-primary"
                                : "text-sidebar-foreground hover:bg-sidebar-accent"
                            )}
                          >
                            {child.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onNavigate(item.id)
                    onCloseMobile()
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive(item.id)
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0",
                      isActive(item.id) ? "text-primary" : ""
                    )}
                  >
                    {item.icon}
                  </span>
                  {isOpen && <span>{item.label}</span>}
                </button>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
