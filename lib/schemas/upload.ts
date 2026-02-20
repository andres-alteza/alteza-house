import { z } from "zod"

export const presignPaymentProofSchema = z.object({
  filename: z.string().trim().min(1, "Filename is required"),
  contentType: z.string().trim().min(1, "Content-Type is required"),
  tenantId: z.string().trim().min(1, "Tenant id is required"),
  paymentId: z.string().trim().min(1, "Payment id is required"),
  year: z.number().int().min(1900, "Year is required"),
  month: z.number().int().min(1).max(12),
})

export const presignContractUploadSchema = z.object({
  contractId: z.string().trim().min(1, "Contract id is required"),
  filename: z.string().trim().min(1, "Filename is required"),
  contentType: z.string().trim().min(1, "Content-Type is required"),
  kind: z.enum(["draft", "signed"]),
})
