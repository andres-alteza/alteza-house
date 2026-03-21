import { Suspense } from "react"
import { ResetPasswordPage } from "@/components/pages/reset-password-page"

function ResetPasswordFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-[#5e35b1] via-[#7c4ddb] to-[#9c6fef]">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/30 border-t-white" />
    </div>
  )
}

export default function ResetPasswordRoute() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordPage />
    </Suspense>
  )
}
