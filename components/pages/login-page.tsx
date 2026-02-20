"use client"

import React from "react"

import { useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { useI18n } from "@/lib/i18n-context"
import { Globe, LogIn } from "lucide-react"
import { toast } from "sonner"

export function LoginPage() {
  const { login, sendPasswordReset } = useAuth()
  const { t, locale, setLocale } = useI18n()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [mode, setMode] = useState<"login" | "reset">("login")
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState("")
  const [resetSuccess, setResetSuccess] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await login(email, password)
    } catch (err: any) {
      const code = err?.code || ""
      let message = ""
      if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential") {
        message = t("auth.invalidCredentials")
      } else if (code === "auth/too-many-requests") {
        message = t("auth.tooManyRequests")
      } else {
        message = err?.message || t("auth.invalidCredentials")
      }
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleSendReset = async () => {
    const trimmedEmail = email.trim()
    setResetError("")
    setResetSuccess("")

    if (!trimmedEmail) {
      const message = t("auth.enterEmail")
      setResetError(message)
      toast.error(message)
      return
    }

    setResetLoading(true)
    try {
      await sendPasswordReset(trimmedEmail)
      const message = t("auth.resetEmailSent")
      setResetSuccess(message)
      toast.success(message)
    } catch (err: any) {
      const code = err?.code || ""
      let errorMessage = ""
      // For security, do not reveal whether a user exists.
      if (code === "auth/user-not-found") {
        const message = t("auth.resetEmailSent")
        setResetSuccess(message)
        toast.success(message)
      } else if (code === "auth/invalid-email") {
        errorMessage = t("auth.invalidEmail")
      } else if (code === "auth/too-many-requests") {
        errorMessage = t("auth.tooManyRequests")
      } else {
        errorMessage = t("auth.resetEmailFailed")
      }
      if (errorMessage) {
        setResetError(errorMessage)
        toast.error(errorMessage)
      }
    } finally {
      setResetLoading(false)
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
              <span className="text-2xl font-black text-primary-foreground">A</span>
            </div>
            <h1 className="text-2xl font-bold text-card-foreground">
              {mode === "login" ? t("auth.loginTitle") : t("auth.resetTitle")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "login" ? t("auth.loginSubtitle") : t("auth.resetSubtitle")}
            </p>
          </div>

          {mode === "login" && error && (
            <div className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {mode === "reset" && resetError && (
            <div className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {resetError}
            </div>
          )}
          {mode === "reset" && resetSuccess && (
            <div className="mb-4 rounded-lg bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
              {resetSuccess}
            </div>
          )}

          <form
            onSubmit={
              mode === "login"
                ? handleSubmit
                : (e) => {
                    e.preventDefault()
                    void handleSendReset()
                  }
            }
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-card-foreground">
                {t("auth.email")} <span className="text-destructive">*</span>
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="correo@ejemplo.com"
                className="rounded-lg border border-input bg-card px-4 py-2.5 text-sm text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
              />
            </div>

            {mode === "login" ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="password" className="text-sm font-medium text-card-foreground">
                    {t("auth.password")} <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="********"
                    className="rounded-lg border border-input bg-card px-4 py-2.5 text-sm text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  <LogIn className="h-4 w-4" />
                  {loading ? t("general.loading") : t("auth.login")}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleSendReset}
                  disabled={resetLoading}
                  className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {resetLoading ? t("general.loading") : t("auth.sendResetLink")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("login")
                    setResetError("")
                    setResetSuccess("")
                  }}
                  className="text-xs text-muted-foreground transition-colors hover:text-primary"
                >
                  {t("auth.backToLogin")}
                </button>
              </>
            )}
          </form>

          <div className="mt-4 text-center">
            {mode === "login" && (
              <button
                type="button"
                onClick={() => {
                  setMode("reset")
                  setPassword("")
                  setError("")
                  setResetError("")
                  setResetSuccess("")
                }}
                className="text-xs text-muted-foreground transition-colors hover:text-primary"
              >
                {t("auth.forgotPassword")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
