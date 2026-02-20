import { z } from "zod"

export const createContractSchema = z.object({
  tenantId: z.string().trim().min(1, "Tenant is required"),
  tenantName: z.string().trim().min(1, "Tenant name is required"),
  startDate: z.string().trim().min(1, "Start date is required"),
  endDate: z.string().trim().min(1, "End date is required"),
  monthlyPrice: z.coerce.number().finite().positive("Monthly price must be > 0"),
})

const contractStatusSchema = z.enum(["ready_to_sign", "signed", "approved", "finished"])

export const updateContractSchema = createContractSchema
  .partial()
  .extend({
    status: contractStatusSchema.optional(),
    pdfUrl: z.string().trim().optional(),
    signedPdfUrl: z.string().trim().optional(),
  })

