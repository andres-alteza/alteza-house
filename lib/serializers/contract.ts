import type { Contract } from "@/lib/types"

export function serializeContract(doc: any): Contract {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId ?? "",
    tenantName: doc.tenantName ?? "",
    startDate: doc.startDate ?? "",
    endDate: doc.endDate ?? "",
    monthlyPrice: doc.monthlyPrice ?? 0,
    status:
      doc.status === "signed" || doc.status === "approved" || doc.status === "finished"
        ? doc.status
        : "ready_to_sign",
    pdfUrl: doc.pdfUrl ?? "",
    signedPdfUrl: doc.signedPdfUrl ?? "",
  }
}

