"use client"

import type { ReactNode } from "react"
import { I18nProvider } from "@/lib/i18n-context"
import { AuthProvider } from "@/lib/auth-context"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider>{children}</AuthProvider>
    </I18nProvider>
  )
}
