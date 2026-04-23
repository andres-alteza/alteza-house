import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { getCollection } from "@/lib/mongodb"
import { withAuth } from "@/lib/api-auth"
import { parseJson } from "@/lib/api-helpers"
import { createTenantSchema } from "@/lib/schemas/tenant"
import { serializeTenant } from "@/lib/serializers/tenant"
import {
  createUserWithEmailPassword,
  deleteUserByUid,
  generatePasswordResetLink,
  getUserByEmail,
} from "@/lib/fb-admin"
import { sendPasswordResetEmail } from "@/lib/resend"

function resolveAppOrigin(req: NextRequest) {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim()
  if (envUrl) return envUrl.replace(/\/$/, "")
  return new URL(req.url).origin
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export const GET = withAuth(async (req: NextRequest, user) => {
  const col = await getCollection("tenants")
  let query: Record<string, any> = { isDeleted: { $ne: true } }

  // Tenants can only see themselves
  if (user.role === "tenant") {
    query = { email: user.email, isDeleted: { $ne: true } }
  }

  const tenants = await col.find(query).sort({ name: 1 }).toArray()

  return NextResponse.json(tenants.map(serializeTenant))
})

export const POST = withAuth(
  async (req: NextRequest) => {
  const parsed = await parseJson(req, createTenantSchema)
  if ("error" in parsed) return parsed.error
  const {
    name,
    email,
    phone,
    tenantTypeId,
    tenantIdNumber,
    houseId,
    houseName,
    parentName,
    parentId,
    parentAddress,
    parentPhone,
    guardianTypeId,
    guardianIdNumber,
  } = parsed.data
  const normalizedEmail = email.toLowerCase()
  const normalizedTenantTypeId = tenantTypeId.trim().toLowerCase()
  const normalizedTenantIdNumber = tenantIdNumber.trim()

  const generateBootstrapPassword = () => {
    const raw = randomBytes(12).toString("base64url")
    return `Bootstrap!${raw}`
  }

  const col = await getCollection("tenants")
  const existingActiveTenantByIdentity = await col.findOne({
    tenantTypeId: new RegExp(`^${escapeRegex(normalizedTenantTypeId)}$`, "i"),
    tenantIdNumber: new RegExp(`^${escapeRegex(normalizedTenantIdNumber)}$`, "i"),
    isDeleted: { $ne: true },
  })
  if (existingActiveTenantByIdentity) {
    return NextResponse.json(
      { error: "There is already a tenant with this ID type and ID number." },
      { status: 409 }
    )
  }

  const existingDeletedTenantByIdentity = await col.findOne({
    tenantTypeId: new RegExp(`^${escapeRegex(normalizedTenantTypeId)}$`, "i"),
    tenantIdNumber: new RegExp(`^${escapeRegex(normalizedTenantIdNumber)}$`, "i"),
    isDeleted: true,
  })

  const existingActiveTenantByEmail = await col.findOne({
    email: new RegExp(`^${escapeRegex(normalizedEmail)}$`, "i"),
    isDeleted: { $ne: true },
  })
  if (existingActiveTenantByEmail) {
    return NextResponse.json({ error: "There is already a tenant with this email." }, { status: 409 })
  }

  const existingFirebaseUser = await getUserByEmail(normalizedEmail)
  let firebaseUid = existingFirebaseUser?.uid
  let createdFirebaseUser = false
  let passwordResetEmailSent = false

  if (!firebaseUid) {
    const bootstrapPassword = generateBootstrapPassword()
    const firebaseUser = await createUserWithEmailPassword({
      email: normalizedEmail,
      password: bootstrapPassword,
      displayName: name,
    })
    firebaseUid = firebaseUser.uid
    createdFirebaseUser = true

    try {
      const continueUrl = `${resolveAppOrigin(req)}/`
      const resetLink = await generatePasswordResetLink(normalizedEmail, continueUrl)
      await sendPasswordResetEmail({ to: normalizedEmail, link: resetLink })
      passwordResetEmailSent = true
    } catch (error) {
      await deleteUserByUid(firebaseUid)
      throw error
    }
  }

  try {
    if (existingDeletedTenantByIdentity) {
      await col.updateOne(
        { _id: existingDeletedTenantByIdentity._id },
        {
          $set: {
            name,
            email: normalizedEmail,
            phone,
            tenantTypeId: normalizedTenantTypeId,
            tenantIdNumber: normalizedTenantIdNumber,
            houseId,
            houseName,
            parentName,
            parentId,
            parentAddress,
            parentPhone,
            guardianTypeId,
            guardianIdNumber,
            firebaseUid,
            isDeleted: false,
            updatedAt: new Date(),
          },
          $unset: { deletedAt: "" },
        }
      )

      return NextResponse.json(
        {
          id: existingDeletedTenantByIdentity._id.toString(),
          name,
          email: normalizedEmail,
          phone,
          tenantTypeId: normalizedTenantTypeId,
          tenantIdNumber: normalizedTenantIdNumber,
          houseId,
          houseName,
          parentName,
          parentId,
          parentAddress,
          parentPhone,
          guardianTypeId,
          guardianIdNumber,
          auth: {
            firebaseUserCreated: createdFirebaseUser,
            passwordResetEmailSent,
          },
        },
        { status: 200 }
      )
    }

    const result = await col.insertOne({
      name,
      email: normalizedEmail,
      phone,
      tenantTypeId: normalizedTenantTypeId,
      tenantIdNumber: normalizedTenantIdNumber,
      houseId,
      houseName,
      parentName,
      parentId,
      parentAddress,
      parentPhone,
      guardianTypeId,
      guardianIdNumber,
      firebaseUid,
      isDeleted: false,
      createdAt: new Date(),
    })

    return NextResponse.json(
      {
        id: result.insertedId.toString(),
        name,
        email: normalizedEmail,
        phone,
        tenantTypeId: normalizedTenantTypeId,
        tenantIdNumber: normalizedTenantIdNumber,
        houseId,
        houseName,
        parentName,
        parentId,
        parentAddress,
        parentPhone,
        guardianTypeId,
        guardianIdNumber,
        auth: {
          firebaseUserCreated: createdFirebaseUser,
          passwordResetEmailSent,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    if (createdFirebaseUser && firebaseUid) {
      try {
        await deleteUserByUid(firebaseUid)
      } catch {
        // Keep original insert error response while avoiding duplicate Firebase users.
      }
    }
    throw error
  }
  },
  { adminOnly: true }
)
