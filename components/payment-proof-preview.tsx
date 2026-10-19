"use client"

import { useEffect, useState } from "react"
import { FileText } from "lucide-react"
import { api } from "@/lib/api-client"
import { useI18n } from "@/lib/i18n-context"
import type { PaymentProofAttachment } from "@/lib/types"

type PreviewState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; url: string; contentType: string }

export function PaymentProofPreview({
  paymentId,
  attachment,
}: {
  paymentId: string
  attachment: PaymentProofAttachment
}) {
  const { t } = useI18n()
  const knownEmpty = attachment.size === 0
  const [preview, setPreview] = useState<PreviewState>(
    knownEmpty ? { status: "empty" } : { status: "loading" }
  )

  useEffect(() => {
    if (knownEmpty) return

    let cancelled = false

    void api
      .getPaymentProofUrl(paymentId, attachment.objectKey)
      .then((data) => {
        if (cancelled) return
        if (!data.size || data.size <= 0) {
          setPreview({ status: "empty" })
          return
        }
        setPreview({
          status: "ready",
          url: data.url,
          contentType: data.contentType,
        })
      })
      .catch(() => {
        if (cancelled) return
        setPreview({ status: "empty" })
      })

    return () => {
      cancelled = true
    }
  }, [attachment.objectKey, knownEmpty, paymentId])

  if (knownEmpty || preview.status === "empty") {
    return (
      <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 px-3 py-4 text-center text-xs font-medium text-muted-foreground">
        {t("payments.emptyProofFile")}
      </div>
    )
  }

  if (preview.status === "loading") {
    return (
      <div className="flex min-h-24 items-center justify-center rounded-md border border-border bg-muted/20 px-3 py-4 text-xs text-muted-foreground">
        {t("general.loading")}
      </div>
    )
  }

  if (preview.contentType.toLowerCase().startsWith("image/")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={preview.url}
        alt={attachment.filename}
        className="max-h-48 w-full rounded-md border border-border bg-muted/20 object-contain"
        onError={() => setPreview({ status: "empty" })}
      />
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
      <FileText className="h-4 w-4 shrink-0" />
      <span className="truncate">{attachment.filename}</span>
    </div>
  )
}
