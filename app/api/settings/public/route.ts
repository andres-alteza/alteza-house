import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api-auth"
import { getAppSettings } from "@/lib/app-settings"

export const GET = withAuth(async () => {
  const settings = await getAppSettings()
  return NextResponse.json({
    paymentDueDate: settings.paymentDueDate,
  })
})
