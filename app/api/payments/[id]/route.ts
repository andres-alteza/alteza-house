import { NextRequest, NextResponse } from "next/server"
import { getCollection } from "@/lib/mongodb"
import { withAuth } from "@/lib/api-auth"
import { parseObjectIdParam } from "@/lib/mongo-helpers"
import { badRequest, parseJson } from "@/lib/api-helpers"
import { updatePaymentSchema } from "@/lib/schemas/payment"
import { serializePayment } from "@/lib/serializers/payment"

type PaymentDoc = {
  _id: import("mongodb").ObjectId
  tenantId: string
  tenantName: string
  tenantEmail: string
  contractId: string
  houseName: string
  month: number
  year: number
  amount: number
  state: "pending" | "approved"
  proofImageUrl?: string
  receiptUrl?: string
  createdAt: Date | string
  updatedAt?: Date
}

export const PATCH = withAuth(async (req: NextRequest, user, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const idParsed = parseObjectIdParam(id)
  if ("error" in idParsed) return idParsed.error

  const bodyParsed = await parseJson(req, updatePaymentSchema)
  if ("error" in bodyParsed) return bodyParsed.error
  const { state, receiptUrl, month, year, proofImageUrl } = bodyParsed.data

  const col = await getCollection<PaymentDoc>("payments")
  const existing = await col.findOne({ _id: idParsed.value })
  if (!existing) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 })
  }

  const isAdmin = user.role === "admin"
  if (!isAdmin) {
    const isOwner = existing.tenantEmail.toLowerCase() === user.email.toLowerCase()
    if (!isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (existing.state !== "pending") {
      return NextResponse.json({ error: "Only pending payments can be edited" }, { status: 403 })
    }
    if (state !== undefined || receiptUrl !== undefined) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const isChangingEditableFields =
    month !== undefined || year !== undefined || proofImageUrl !== undefined
  if (existing.state === "approved" && isChangingEditableFields) {
    return badRequest("Approved payments cannot be modified")
  }

  const nextMonth = month ?? existing.month
  const nextYear = year ?? existing.year
  if (
    (nextMonth !== existing.month || nextYear !== existing.year) &&
    !!(await col.findOne({
      _id: { $ne: idParsed.value },
      contractId: existing.contractId,
      month: nextMonth,
      year: nextYear,
    }))
  ) {
    return badRequest("A payment for this month already exists")
  }

  const updateFields: Record<string, any> = { updatedAt: new Date() }
  if (state !== undefined) updateFields.state = state
  if (receiptUrl !== undefined) {
    updateFields.receiptUrl = receiptUrl
  } else if (state === "approved") {
    updateFields.receiptUrl = `/api/payments/${id}/receipt`
  }
  if (month !== undefined) updateFields.month = month
  if (year !== undefined) updateFields.year = year
  if (proofImageUrl !== undefined) updateFields.proofImageUrl = proofImageUrl

  const updated = await col.findOneAndUpdate(
    { _id: idParsed.value },
    { $set: updateFields },
    { returnDocument: "after" }
  )
  if (!updated) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 })
  }

  return NextResponse.json(serializePayment(updated))
})

export const DELETE = withAuth(
  async (req: NextRequest, _user, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const idParsed = parseObjectIdParam(id)
  if ("error" in idParsed) return idParsed.error

  const col = await getCollection<PaymentDoc>("payments")
  await col.deleteOne({ _id: idParsed.value })

  return NextResponse.json({ success: true })
  },
  { adminOnly: true }
)
