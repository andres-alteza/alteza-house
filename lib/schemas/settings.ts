import { z } from "zod"

export const settingsSchema = z.object({
  adminEmails: z.array(z.string().trim().email()).default([]),
  enableNotifications: z.boolean(),
  notificationEmails: z.array(z.string().trim().email()).default([]),
  paymentDueDate: z.number().int().min(1).max(28),
  legalRepresentativeName: z.string().trim().min(1, "Legal representative name is required"),
  legalRepresentativeRole: z.string().trim().min(1, "Legal representative role is required"),
  legalRepresentativeAddress: z.string().trim().min(1, "Legal representative address is required"),
  legalRepresentativePhone: z.string().trim().min(1, "Legal representative phone is required"),
})

