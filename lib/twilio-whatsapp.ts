export type TwilioWhatsAppConfig = {
  accountSid: string
  authToken: string
  contentSid: string
  from?: string
  messagingServiceSid?: string
}

export type SendWhatsAppTemplateInput = {
  to: string
  variables: Record<string, string>
}

export type SendWhatsAppTemplateResult = {
  sid: string
  status: string
  to: string
}

export function normalizeWhatsAppPhone(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null

  const hasInternationalPrefix = trimmed.startsWith("+")
  let digits = trimmed.replace(/\D/g, "")
  if (!digits) return null

  if (digits.startsWith("00")) {
    digits = digits.slice(2)
  } else if (!hasInternationalPrefix && digits.length === 10 && digits.startsWith("3")) {
    digits = `57${digits}`
  }

  if (digits.length < 8 || digits.length > 15) return null
  return `whatsapp:+${digits}`
}

export function formatCurrencyForWhatsApp(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value)
}

export function getTwilioWhatsAppConfig(): TwilioWhatsAppConfig {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim()
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim()
  const contentSid = process.env.TWILIO_WHATSAPP_PAYMENT_REMINDER_CONTENT_SID?.trim()
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim()
  const from = process.env.TWILIO_WHATSAPP_FROM?.trim()

  const missing = [
    !accountSid ? "TWILIO_ACCOUNT_SID" : null,
    !authToken ? "TWILIO_AUTH_TOKEN" : null,
    !contentSid ? "TWILIO_WHATSAPP_PAYMENT_REMINDER_CONTENT_SID" : null,
    !messagingServiceSid && !from ? "TWILIO_MESSAGING_SERVICE_SID or TWILIO_WHATSAPP_FROM" : null,
  ].filter(Boolean)

  if (missing.length) {
    throw new Error(`Missing Twilio WhatsApp configuration: ${missing.join(", ")}`)
  }

  return {
    accountSid: accountSid!,
    authToken: authToken!,
    contentSid: contentSid!,
    messagingServiceSid,
    from,
  }
}

export async function sendWhatsAppTemplate(
  config: TwilioWhatsAppConfig,
  input: SendWhatsAppTemplateInput
): Promise<SendWhatsAppTemplateResult> {
  const body = new URLSearchParams({
    To: input.to,
    ContentSid: config.contentSid,
    ContentVariables: JSON.stringify(input.variables),
  })

  if (config.messagingServiceSid) {
    body.set("MessagingServiceSid", config.messagingServiceSid)
  } else if (config.from) {
    body.set("From", config.from)
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    }
  )

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      typeof payload?.message === "string" ? payload.message : `Twilio request failed with ${response.status}`
    throw new Error(message)
  }

  return {
    sid: String(payload.sid ?? ""),
    status: String(payload.status ?? ""),
    to: input.to,
  }
}

