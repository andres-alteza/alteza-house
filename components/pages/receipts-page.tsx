"use client"

import { useState } from "react"
import useSWR from "swr"
import { useI18n } from "@/lib/i18n-context"
import { api } from "@/lib/api-client"
import { DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { Download, Loader2 } from "lucide-react"
import type { Payment } from "@/lib/types"
import { toast } from "sonner"

export function ReceiptsPage() {
  const { t } = useI18n()
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null)

  const { data: approvedPayments = [] } = useSWR<Payment[]>(
    ["payments", { state: "approved" }],
    () => api.getPayments({ state: "approved" })
  )

  const columns = [
    { key: "tenantName", label: t("tenants.name") },
    { key: "houseName", label: t("tenants.house") },
    {
      key: "month",
      label: t("payments.month"),
      render: (p: Payment) => `${t(`month.${p.month}`)} ${p.year}`,
    },
    {
      key: "amount",
      label: t("payments.amount"),
      render: (p: Payment) => `$${p.amount.toLocaleString()}`,
    },
    {
      key: "state",
      label: t("payments.state"),
      render: () => (
        <span className="inline-flex rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
          {t("payments.approved")}
        </span>
      ),
    },
  ]

  const openReceipt = async (paymentId: string) => {
    if (downloadingReceiptId) return
    setDownloadingReceiptId(paymentId)
    try {
      const blob = await api.getPaymentReceipt(paymentId)
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = objectUrl
      anchor.download = `receipt-${paymentId}.pdf`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000)
      toast.success(t("general.openedSuccess"))
    } catch (error) {
      console.error("Download receipt error:", error)
      toast.error(t("general.openError"))
    } finally {
      setDownloadingReceiptId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("nav.receipts")} />

      <div className="rounded-xl border border-border bg-card">
        <DataTable
          columns={columns}
          data={approvedPayments}
          actions={(payment: Payment) =>
            payment.receiptUrl ? (
              <button
                type="button"
                onClick={() => void openReceipt(payment.id)}
                disabled={downloadingReceiptId === payment.id}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {downloadingReceiptId === payment.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {downloadingReceiptId === payment.id ? t("general.loading") : "PDF"}
              </button>
            ) : null
          }
        />
      </div>
    </div>
  )
}
