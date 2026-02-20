import { z } from "zod"

export const paymentStateSchema = z.enum(["pending", "approved"])

export const createPaymentSchema = z.object({
  tenantId: z.string().trim().min(1, "Tenant is required"),
  tenantName: z.string().trim().min(1, "Tenant name is required"),
  tenantEmail: z.string().trim().email("Valid tenant email is required"),
  contractId: z.string().trim().min(1, "Contract is required"),
  houseName: z.string().trim().min(1, "House name is required"),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(3000),
  amount: z.coerce.number().finite().positive("Amount must be > 0"),
  proofImageUrl: z.string().trim().default(""),
})

export const updatePaymentSchema = z.object({
  state: paymentStateSchema.optional(),
  receiptUrl: z.string().trim().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(3000).optional(),
  proofImageUrl: z.string().trim().optional(),
})

export const paymentsQuerySchema = z.object({
  tenantId: z.string().trim().optional(),
  houseName: z.string().trim().optional(),
  month: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number.parseInt(v, 10) : undefined))
    .refine((v) => v === undefined || (Number.isInteger(v) && v >= 1 && v <= 12), {
      message: "Invalid month",
    }),
  year: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number.parseInt(v, 10) : undefined))
    .refine((v) => v === undefined || (Number.isInteger(v) && v >= 2000 && v <= 3000), {
      message: "Invalid year",
    }),
  state: paymentStateSchema.optional(),
})

