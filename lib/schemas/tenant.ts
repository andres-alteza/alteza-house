import { z } from "zod"

export const createTenantSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Valid email is required"),
  phone: z.string().trim().min(1, "Phone is required"),
  tenantTypeId: z.string().trim().min(1, "Tenant ID type is required"),
  tenantIdNumber: z.string().trim().min(1, "Tenant ID number is required"),
  houseId: z.string().trim().min(1, "House is required"),
  houseName: z.string().trim(),
  parentName: z.string().trim().min(1, "Guardian name is required"),
  parentId: z.string().trim().optional().default(""),
  parentAddress: z.string().trim().min(1, "Guardian address is required"),
  parentPhone: z.string().trim().min(1, "Guardian phone is required"),
  guardianTypeId: z.string().trim().min(1, "Guardian ID type is required"),
  guardianIdNumber: z.string().trim().min(1, "Guardian ID number is required"),
})

export const updateTenantSchema = createTenantSchema

