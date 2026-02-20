import { z } from "zod"

export const createHouseSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  address: z.string().trim().min(1, "Address is required"),
})

export const updateHouseSchema = createHouseSchema

