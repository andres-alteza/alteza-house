import { z } from "zod"
import { CONTRACT_MAX_BYTES } from "../contract-pdf-constraints"
import { PAYMENT_PROOF_MAX_BYTES } from "../payment-proof-constraints"

export const presignPaymentProofSchema = z.object({
  filename: z.string().trim().min(1, "Filename is required"),
  contentType: z.string().trim().min(1, "Content-Type is required"),
  size: z
    .number({ required_error: "File size is required" })
    .int("File size is required")
    .min(1, "File is empty")
    .max(PAYMENT_PROOF_MAX_BYTES, "File is larger than 10 MB"),
  tenantId: z.string().trim().min(1, "Tenant id is required"),
  paymentId: z.string().trim().min(1, "Payment id is required"),
  year: z.number().int().min(1900, "Year is required"),
  month: z.number().int().min(1).max(12),
})

export const presignContractUploadSchema = z.object({
  contractId: z.string().trim().min(1, "Contract id is required"),
  filename: z.string().trim().min(1, "Filename is required"),
  contentType: z.string().trim().min(1, "Content-Type is required"),
  size: z
    .number({ required_error: "File size is required" })
    .int("File size is required")
    .min(1, "File is empty")
    .max(CONTRACT_MAX_BYTES, "File is larger than 20 MB"),
  kind: z.enum(["draft", "signed"]),
})
