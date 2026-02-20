import { NextRequest, NextResponse } from "next/server"
import { getCollection } from "@/lib/mongodb"
import { withAuth } from "@/lib/api-auth"
import { parseObjectIdParam } from "@/lib/mongo-helpers"
import { parseJson } from "@/lib/api-helpers"
import { updateTenantSchema } from "@/lib/schemas/tenant"
import { serializeTenant } from "@/lib/serializers/tenant"
import { getUserByEmail, updateUserEmailByUid } from "@/lib/fb-admin"

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export const GET = withAuth(async (req: NextRequest, user, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const idParsed = parseObjectIdParam(id)
  if ("error" in idParsed) return idParsed.error
  const col = await getCollection("tenants")
  const tenant = await col.findOne({ _id: idParsed.value, isDeleted: { $ne: true } })

  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  }

  // Tenant users can only access their own tenant record.
  if (user.role === "tenant" && (tenant.email ?? "").toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return NextResponse.json(serializeTenant(tenant))
})

export const PUT = withAuth(
  async (req: NextRequest, _user, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const idParsed = parseObjectIdParam(id)
  if ("error" in idParsed) return idParsed.error

  const parsed = await parseJson(req, updateTenantSchema)
  if ("error" in parsed) return parsed.error

  const col = await getCollection("tenants")
  const existingTenant = await col.findOne({ _id: idParsed.value, isDeleted: { $ne: true } })
  if (!existingTenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  }

  const normalizedEmail = parsed.data.email.toLowerCase()
  const normalizedTenantTypeId = parsed.data.tenantTypeId.trim().toLowerCase()
  const normalizedTenantIdNumber = parsed.data.tenantIdNumber.trim()
  const emailChanged = (existingTenant.email ?? "").toLowerCase() !== normalizedEmail
  const identityChanged =
    (existingTenant.tenantTypeId ?? "").toLowerCase() !== normalizedTenantTypeId ||
    (existingTenant.tenantIdNumber ?? "").toLowerCase() !== normalizedTenantIdNumber.toLowerCase()
  let resolvedFirebaseUid: string | undefined

  if (identityChanged) {
    const duplicateByIdentity = await col.findOne({
      _id: { $ne: idParsed.value },
      tenantTypeId: new RegExp(`^${escapeRegex(normalizedTenantTypeId)}$`, "i"),
      tenantIdNumber: new RegExp(`^${escapeRegex(normalizedTenantIdNumber)}$`, "i"),
      isDeleted: { $ne: true },
    })
    if (duplicateByIdentity) {
      return NextResponse.json(
        { error: "There is already a tenant with this ID type and ID number." },
        { status: 409 }
      )
    }
  }

  if (emailChanged) {
    const duplicateTenant = await col.findOne({
      _id: { $ne: idParsed.value },
      email: new RegExp(`^${escapeRegex(normalizedEmail)}$`, "i"),
      isDeleted: { $ne: true },
    })
    if (duplicateTenant) {
      return NextResponse.json({ error: "There is already a tenant with this email." }, { status: 409 })
    }

    const firebaseUid = typeof existingTenant.firebaseUid === "string" ? existingTenant.firebaseUid : undefined
    if (firebaseUid) {
      try {
        await updateUserEmailByUid(firebaseUid, normalizedEmail)
        resolvedFirebaseUid = firebaseUid
      } catch {
        return NextResponse.json({ error: "Could not update tenant email in Firebase" }, { status: 409 })
      }
    } else {
      const firebaseUserByOldEmail = await getUserByEmail((existingTenant.email ?? "").toLowerCase())
      if (!firebaseUserByOldEmail) {
        return NextResponse.json(
          { error: "Tenant has no linked Firebase account to update email" },
          { status: 409 }
        )
      }

      try {
        await updateUserEmailByUid(firebaseUserByOldEmail.uid, normalizedEmail)
        resolvedFirebaseUid = firebaseUserByOldEmail.uid
      } catch {
        return NextResponse.json({ error: "Could not update tenant email in Firebase" }, { status: 409 })
      }
    }
  }

  await col.updateOne(
    { _id: idParsed.value },
    {
      $set: {
        ...parsed.data,
        email: normalizedEmail,
        tenantTypeId: normalizedTenantTypeId,
        tenantIdNumber: normalizedTenantIdNumber,
        ...(resolvedFirebaseUid ? { firebaseUid: resolvedFirebaseUid } : {}),
        updatedAt: new Date(),
      },
    }
  )

  return NextResponse.json({
    id,
    ...parsed.data,
    email: normalizedEmail,
    tenantTypeId: normalizedTenantTypeId,
    tenantIdNumber: normalizedTenantIdNumber,
  })
  },
  { adminOnly: true }
)

export const DELETE = withAuth(
  async (req: NextRequest, _user, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const idParsed = parseObjectIdParam(id)
  if ("error" in idParsed) return idParsed.error

  const col = await getCollection("tenants")
  const result = await col.updateOne(
    { _id: idParsed.value, isDeleted: { $ne: true } },
    { $set: { isDeleted: true, deletedAt: new Date(), updatedAt: new Date() } }
  )
  if (result.matchedCount === 0) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  }

  return NextResponse.json({ success: true })
  },
  { adminOnly: true }
)
