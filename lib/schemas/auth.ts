import { z } from "zod"

export const verifyTokenSchema = z.object({
  token: z.string().min(1, "Token is required"),
})

export const passwordResetSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
})

