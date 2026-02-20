import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { z, type ZodTypeAny } from "zod"

function zodErrorMessage(error: z.ZodError): string {
  // Keep it short and user-friendly for API callers.
  return error.issues.map((i) => i.message).join(", ")
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function parseJson<TSchema extends ZodTypeAny>(
  req: NextRequest,
  schema: TSchema
): Promise<{ data: z.infer<TSchema> } | { error: NextResponse }> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return { error: badRequest("Invalid JSON body") }
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return { error: badRequest(zodErrorMessage(parsed.error)) }
  }

  return { data: parsed.data }
}

export function parseQuery<TSchema extends ZodTypeAny>(
  req: NextRequest,
  schema: TSchema
): { data: z.infer<TSchema> } | { error: NextResponse } {
  const url = new URL(req.url)
  const obj = Object.fromEntries(url.searchParams.entries())

  const parsed = schema.safeParse(obj)
  if (!parsed.success) {
    return { error: badRequest(zodErrorMessage(parsed.error)) }
  }

  return { data: parsed.data }
}

