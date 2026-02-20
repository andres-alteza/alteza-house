import { NextRequest, NextResponse } from "next/server"
import { getCollection } from "@/lib/mongodb"
import { withAuth } from "@/lib/api-auth"
import { parseJson, parseQuery } from "@/lib/api-helpers"
import { createPaymentSchema, paymentsQuerySchema } from "@/lib/schemas/payment"
import { serializePayment } from "@/lib/serializers/payment"
import { parseObjectIdParam } from "@/lib/mongo-helpers"

type TenantDoc = {
  _id: import("mongodb").ObjectId
  email: string
}

type ContractDoc = {
  _id: import("mongodb").ObjectId
  tenantId: string
  status: "ready_to_sign" | "signed" | "approved" | "finished"
  startDate: string
  endDate: string
}

function getCurrentLocalDate() {
  const now = new Date()
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return localTime.toISOString().slice(0, 10)
}

export const GET = withAuth(async (req: NextRequest, user) => {
  const col = await getCollection("payments")
  const query: Record<string, any> = {}

  // Tenants can only see their own payments
  if (user.role === "tenant") {
    query.tenantEmail = user.email
  }

  const parsedQuery = parseQuery(req, paymentsQuerySchema)
  if ("error" in parsedQuery) return parsedQuery.error
  const { tenantId, houseName, month, year, state } = parsedQuery.data

  if (tenantId) query.tenantId = tenantId
  if (houseName) query.houseName = houseName
  if (month !== undefined) query.month = month
  if (year !== undefined) query.year = year
  if (state) query.state = state

  const payments = await col.find(query).sort({ createdAt: -1 }).toArray()

  return NextResponse.json(payments.map(serializePayment))
})

export const POST = withAuth(async (req: NextRequest, user) => {
  const parsed = await parseJson(req, createPaymentSchema)
  if ("error" in parsed) return parsed.error
  const { tenantId, tenantName, tenantEmail, contractId, houseName, month, year, amount, proofImageUrl } =
    parsed.data

  if (user.role === "tenant") {
    const tenantIdParsed = parseObjectIdParam(tenantId)
    const contractIdParsed = parseObjectIdParam(contractId)
    if ("error" in tenantIdParsed || "error" in contractIdParsed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (tenantEmail.toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const tenantsCol = await getCollection<TenantDoc>("tenants")
    const tenant = await tenantsCol.findOne({ _id: tenantIdParsed.value })
    const isOwner = tenant?.email?.toLowerCase() === user.email.toLowerCase()
    if (!isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const contractsCol = await getCollection<ContractDoc>("contracts")
    const localToday = getCurrentLocalDate()
    const activeContract = await contractsCol.findOne({
      _id: contractIdParsed.value,
      tenantId,
      status: "approved",
      startDate: { $lte: localToday },
      endDate: { $gte: localToday },
    })

    if (!activeContract) {
      return NextResponse.json({ error: "Tenant does not have an active contract" }, { status: 400 })
    }
  }

  const col = await getCollection("payments")
  const createdAt = new Date()
  const result = await col.insertOne({
    tenantId,
    tenantName,
    tenantEmail,
    contractId,
    houseName,
    month,
    year,
    amount,
    state: "pending",
    proofImageUrl: proofImageUrl || "",
    receiptUrl: "",
    createdAt,
  })

  return NextResponse.json(
    {
      id: result.insertedId.toString(),
      tenantId,
      tenantName,
      tenantEmail,
      contractId,
      houseName,
      month,
      year,
      amount,
      state: "pending",
      proofImageUrl: proofImageUrl || "",
      receiptUrl: "",
      createdAt: createdAt.toISOString(),
    },
    { status: 201 }
  )
})
