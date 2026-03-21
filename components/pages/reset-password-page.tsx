"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Eye, EyeOff, Globe, KeyRound } from "lucide-react"
import { auth, confirmPasswordReset, verifyPasswordResetCode } from "@/lib/firebase"
import { useI18n } from "@/lib/i18n-context"

function mapResetCodeError(code: string, fallback: string, invalidLink: string) {
  if (code === "auth/expired-action-code" || code === "auth/invalid-action-code") {
    return invalidLink
  }
  return fallback
}

export function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t, locale, setLocale } = useI18n()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [email, setEmail] = useState("")
  const [verifying, setVerifying] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const mode = searchParams.get("mode")
  const oobCode = useMemo(() => searchParams.get("oobCode")?.trim() ?? "", [searchParams])

  useEffect(() => {
    let active = true

    async function validateCode() {
      if (!oobCode || mode !== "resetPassword") {
        setError(t("auth.resetLinkInvalid"))
        setVerifying(false)
        return
      }

      setVerifying(true)
      setError("")

      try {
        const resolvedEmail = await verifyPasswordResetCode(auth, oobCode)
        if (!active) return
        setEmail(resolvedEmail)
      } catch (err: any) {
        if (!active) return
        setError(
          mapResetCodeError(
            err?.code || "",
            t("auth.resetLinkCheckFailed"),
            t("auth.resetLinkInvalid"),
          ),
        )
      } finally {
        if (active) {
          setVerifying(false)
        }
      }
    }

    void validateCode()

    return () => {
      active = false
    }
  }, [mode, oobCode, t])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!oobCode) {
      setError(t("auth.resetLinkInvalid"))
      return
    }

    if (password.length < 6) {
      setError(t("auth.passwordMinLength"))
      return
    }

    if (password !== confirmPassword) {
      setError(t("auth.passwordsDoNotMatch"))
      return
    }

    setSubmitting(true)
    setError("")

    try {
      await confirmPasswordReset(auth, oobCode, password)
      setSuccess(true)
    } catch (err: any) {
      const code = err?.code || ""
      if (code === "auth/weak-password") {
        setError(t("auth.passwordMinLength"))
      } else {
        setError(
          mapResetCodeError(
            code,
            t("auth.resetPasswordFailed"),
            t("auth.resetLinkInvalid"),
          ),
        )
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-[#5e35b1] via-[#7c4ddb] to-[#9c6fef] px-4 py-12 sm:px-6">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <button
          type="button"
          onClick={() => setLocale(locale === "es" ? "en" : "es")}
          className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-white transition-colors hover:bg-white/20"
        >
          <Globe className="h-3.5 w-3.5" />
          {locale}
        </button>
      </div>

      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-card p-6 shadow-2xl sm:p-8">
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-primary to-[#7c4ddb]">
              <KeyRound className="h-7 w-7 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-card-foreground">{t("auth.resetPasswordTitle")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("auth.resetPasswordSubtitle")}</p>
          </div>

          {verifying ? (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
              <p className="text-sm text-muted-foreground">{t("auth.verifyingResetLink")}</p>
            </div>
          ) : success ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
                {t("auth.resetPasswordSuccess")}
              </div>
              <button
                type="button"
                onClick={() => router.push("/")}
                className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {t("auth.backToLogin")}
              </button>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {email ? (
                <>
                  <div className="mb-4 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
                    {t("auth.resetPasswordFor")}{" "}
                    <span className="font-semibold text-card-foreground">{email}</span>
                  </div>

                  <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="password" className="text-sm font-medium text-card-foreground">
                        {t("auth.newPassword")} <span className="text-destructive">*</span>
                      </label>
                      <div className="relative">
                        <input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={6}
                          placeholder="********"
                          className="w-full rounded-lg border border-input bg-card px-4 py-2.5 pr-10 text-sm text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-card-foreground"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="confirm-password" className="text-sm font-medium text-card-foreground">
                        {t("auth.confirmPassword")} <span className="text-destructive">*</span>
                      </label>
                      <div className="relative">
                        <input
                          id="confirm-password"
                          type={showConfirmPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          required
                          minLength={6}
                          placeholder="********"
                          className="w-full rounded-lg border border-input bg-card px-4 py-2.5 pr-10 text-sm text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword((prev) => !prev)}
                          aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-card-foreground"
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      {submitting ? t("general.loading") : t("auth.updatePassword")}
                    </button>

                    <button
                      type="button"
                      onClick={() => router.push("/")}
                      className="text-xs text-muted-foreground transition-colors hover:text-primary"
                    >
                      {t("auth.backToLogin")}
                    </button>
                  </form>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => router.push("/")}
                  className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {t("auth.backToLogin")}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
