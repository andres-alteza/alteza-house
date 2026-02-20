import type { Payment } from "@/lib/types"
import { toIsoDateString } from "@/lib/serializers/common"

export function serializePayment(doc: any): Payment {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId ?? "",
    tenantName: doc.tenantName ?? "",
    tenantEmail: doc.tenantEmail ?? "",
    contractId: doc.contractId ?? "",
    houseName: doc.houseName ?? "",
    month: doc.month ?? 0,
    year: doc.year ?? 0,
    amount: doc.amount ?? 0,
    state: doc.state ?? "pending",
    proofImageUrl: doc.proofImageUrl ?? "",
    receiptUrl: doc.receiptUrl ?? "",
    createdAt: toIsoDateString(doc.createdAt),
  }
}

