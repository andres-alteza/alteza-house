"use client"

import { useMemo, useState } from "react"
import { ChevronDown, Home } from "lucide-react"
import { useI18n } from "@/lib/i18n-context"
import {
  groupPaymentsByMonthAndHouse,
  houseGroupKey,
  monthGroupKey,
  type PaymentHouseGroup,
  type PaymentMonthGroup,
} from "@/lib/group-payments"
import type { Payment } from "@/lib/types"
import { cn } from "@/lib/utils"

interface PaymentsGroupedTableProps {
  payments: Payment[]
  onView: (payment: Payment) => void
  actions?: (payment: Payment) => React.ReactNode
}

function formatAmount(amount: number) {
  return `$${amount.toLocaleString()}`
}

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`
}

function PaymentStateBadge({ state }: { state: Payment["state"] }) {
  const { t } = useI18n()
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        state === "approved" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
      )}
    >
      {state === "approved" ? t("payments.approved") : t("payments.pending")}
    </span>
  )
}

export function PaymentsGroupedTable({
  payments,
  onView,
  actions,
}: PaymentsGroupedTableProps) {
  const { t } = useI18n()
  const groups = useMemo(() => groupPaymentsByMonthAndHouse(payments), [payments])
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(() => new Set())
  const [collapsedHouses, setCollapsedHouses] = useState<Set<string>>(() => new Set())

  const now = new Date()
  const currentMonthKey = monthGroupKey(now.getFullYear(), now.getMonth() + 1)
  const hasActions = Boolean(actions)
  const columnCount = hasActions ? 4 : 3

  const toggleMonth = (key: string) => {
    setCollapsedMonths((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleHouse = (key: string) => {
    setCollapsedHouses((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const expandAll = () => {
    setCollapsedMonths(new Set())
    setCollapsedHouses(new Set())
  }

  const collapseAll = () => {
    setCollapsedMonths(new Set(groups.map((group) => group.key)))
  }

  if (payments.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
        {t("general.noData")}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={expandAll}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-card-foreground transition-colors hover:bg-muted"
          >
            {t("payments.expandAll")}
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-card-foreground transition-colors hover:bg-muted"
          >
            {t("payments.collapseAll")}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {countLabel(payments.length, t("payments.paymentSingular"), t("payments.paymentPlural"))}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <MonthSection
            key={group.key}
            group={group}
            isCurrentMonth={group.key === currentMonthKey}
            isOpen={!collapsedMonths.has(group.key)}
            collapsedHouses={collapsedHouses}
            columnCount={columnCount}
            hasActions={hasActions}
            onToggle={() => toggleMonth(group.key)}
            onToggleHouse={toggleHouse}
            onView={onView}
            actions={actions}
          />
        ))}
      </div>
    </div>
  )
}

function MonthSection({
  group,
  isCurrentMonth,
  isOpen,
  collapsedHouses,
  columnCount,
  hasActions,
  onToggle,
  onToggleHouse,
  onView,
  actions,
}: {
  group: PaymentMonthGroup
  isCurrentMonth: boolean
  isOpen: boolean
  collapsedHouses: Set<string>
  columnCount: number
  hasActions: boolean
  onToggle: () => void
  onToggleHouse: (key: string) => void
  onView: (payment: Payment) => void
  actions?: (payment: Payment) => React.ReactNode
}) {
  const { t } = useI18n()
  const panelId = `month-panel-${group.key}`
  const monthLabel = `${t(`month.${group.month}`)} ${group.year}`

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 border-b border-border bg-sidebar-accent px-4 py-3 text-left transition-colors hover:bg-sidebar-accent/80"
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-primary transition-transform duration-200",
            !isOpen && "-rotate-90"
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight text-card-foreground">
              {monthLabel}
            </h2>
            {isCurrentMonth && (
              <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {t("payments.thisMonth")}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {countLabel(group.houseCount, t("payments.houseSingular"), t("payments.housePlural"))}
            {" · "}
            {countLabel(
              group.paymentCount,
              t("payments.paymentSingular"),
              t("payments.paymentPlural")
            )}
            {group.pendingCount > 0
              ? ` · ${group.pendingCount} ${t("payments.pendingLabel")}`
              : ""}
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-card-foreground">
          {formatAmount(group.totalAmount)}
        </span>
      </button>

      {isOpen && (
        <div id={panelId}>
          <div className="overflow-x-auto">
            <table className="min-w-[640px] w-full">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {t("tenants.name")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {t("payments.amount")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {t("payments.state")}
                  </th>
                  {hasActions && (
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {t("general.actions")}
                    </th>
                  )}
                </tr>
              </thead>
              {group.houses.map((house) => (
                <HouseGroup
                  key={houseGroupKey(group.key, house.houseName)}
                  monthKey={group.key}
                  house={house}
                  isOpen={!collapsedHouses.has(houseGroupKey(group.key, house.houseName))}
                  columnCount={columnCount}
                  hasActions={hasActions}
                  onToggle={() => onToggleHouse(houseGroupKey(group.key, house.houseName))}
                  onView={onView}
                  actions={actions}
                />
              ))}
              <tfoot>
                <tr className="border-t border-border bg-muted/40">
                  <td className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("payments.monthTotal")}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold tabular-nums text-card-foreground">
                    {formatAmount(group.totalAmount)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {group.pendingCount > 0
                      ? `${group.pendingCount} ${t("payments.pendingLabel")}`
                      : t("payments.approved")}
                  </td>
                  {hasActions && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

function HouseGroup({
  monthKey,
  house,
  isOpen,
  columnCount,
  hasActions,
  onToggle,
  onView,
  actions,
}: {
  monthKey: string
  house: PaymentHouseGroup
  isOpen: boolean
  columnCount: number
  hasActions: boolean
  onToggle: () => void
  onView: (payment: Payment) => void
  actions?: (payment: Payment) => React.ReactNode
}) {
  const { t } = useI18n()
  const houseLabel = house.houseName || t("payments.unknownHouse")
  const panelId = `house-panel-${monthKey}-${house.houseName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "unknown"}`

  return (
    <tbody id={panelId}>
      <tr className="border-t border-border bg-muted/50">
        <th colSpan={columnCount} scope="colgroup" className="p-0">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-controls={panelId}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-muted"
          >
            <span className="h-4 w-1 shrink-0 rounded-full bg-primary/60" aria-hidden />
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                !isOpen && "-rotate-90"
              )}
            />
            <Home className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="min-w-0 truncate text-sm font-semibold text-card-foreground">
              {houseLabel}
            </span>
            <span className="inline-flex rounded-full bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-border">
              {countLabel(
                house.payments.length,
                t("payments.paymentSingular"),
                t("payments.paymentPlural")
              )}
            </span>
            {house.pendingCount > 0 && (
              <span className="inline-flex rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                {house.pendingCount} {t("payments.pendingLabel")}
              </span>
            )}
            <span className="ml-auto text-sm font-medium tabular-nums text-card-foreground">
              {formatAmount(house.totalAmount)}
            </span>
          </button>
        </th>
      </tr>
      {isOpen &&
        house.payments.map((payment) => (
          <tr
            key={payment.id}
            onClick={() => onView(payment)}
            className="cursor-pointer border-b border-border/50 last:border-b-0 transition-colors hover:bg-muted/30"
          >
            <td className="px-4 py-3 pl-12 text-sm text-foreground">{payment.tenantName}</td>
            <td className="px-4 py-3 text-sm tabular-nums text-foreground">
              {formatAmount(payment.amount)}
            </td>
            <td className="px-4 py-3">
              <PaymentStateBadge state={payment.state} />
            </td>
            {hasActions && (
              <td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                <div className="inline-flex items-center gap-1">{actions?.(payment)}</div>
              </td>
            )}
          </tr>
        ))}
    </tbody>
  )
}
