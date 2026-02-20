import { z } from "zod"

export const verifyTokenSchema = z.object({
  token: z.string().min(1, "Token is required"),
})

