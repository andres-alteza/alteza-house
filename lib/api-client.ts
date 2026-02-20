import { auth } from "@/lib/firebase"
import type {
  Contract,
  CreateContractInput,
  CreateHouseInput,
  CreatePaymentInput,
  CreateTenantInput,
  CreateTenantResponse,
  House,
  Payment,
  Settings,
  Tenant,
  UpdatePaymentInput,
  UpdateContractInput,
  UpdateHouseInput,
  UpdateTenantInput,
} from "@/lib/types"

async function getToken(): Promise<string | null> {
  const user = auth.currentUser
  if (!user) return null
  return user.getIdToken()
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken()
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }

  const res = await fetch(url, { ...options, headers })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `API error: ${res.status}`)
  }

  return res.json() as Promise<T>
}

async function apiFetchBlob(url: string, options: RequestInit = {}): Promise<Blob> {
  const token = await getToken()
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }

  const res = await fetch(url, { ...options, headers })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `API error: ${res.status}`)
  }

  return res.blob()
}

type PresignPaymentProofRequest = {
  filename: string
  contentType: string
  tenantId: string
  paymentId: string
  year: number
  month: number
}

type PresignPaymentProofResponse = {
  uploadUrl: string
  objectKey: string
  contentType: string
}

type PresignContractUploadRequest = {
  contractId: string
  filename: string
  contentType: string
  kind: "draft" | "signed"
}

type PresignContractUploadResponse = {
  uploadUrl: string
  objectKey: string
  contentType: string
}

type PaymentsReportFilters = {
  houseId?: string
  tenantId?: string
  year?: string
  month?: string
  state?: "pending" | "approved" | "all"
}

type SendPaymentsReportEmailInput = PaymentsReportFilters & {
  emails: string[]
}

function buildQueryParams(filters: Record<string, string | undefined>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "" || value === "undefined") continue
    params.set(key, value)
  }
  return params
}

type VerifyTokenResponse = {
  user: {
    id: string
    firebaseUid: string
    email: string
    name: string
    role: "admin" | "tenant"
  }
}

export const api = {
  // Auth
  verifyToken: (token: string): Promise<VerifyTokenResponse> =>
    apiFetch("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  // Houses
  getHouses: (): Promise<House[]> => apiFetch("/api/houses"),
  createHouse: (data: CreateHouseInput): Promise<House> =>
    apiFetch("/api/houses", { method: "POST", body: JSON.stringify(data) }),
  updateHouse: (id: string, data: UpdateHouseInput): Promise<House> =>
    apiFetch(`/api/houses/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteHouse: (id: string): Promise<{ success: true }> =>
    apiFetch(`/api/houses/${id}`, { method: "DELETE" }),

  // Tenants
  getTenants: (): Promise<Tenant[]> => apiFetch("/api/tenants"),
  getTenant: (id: string): Promise<Tenant> => apiFetch(`/api/tenants/${id}`),
  createTenant: (data: CreateTenantInput): Promise<CreateTenantResponse> =>
    apiFetch("/api/tenants", { method: "POST", body: JSON.stringify(data) }),
  updateTenant: (id: string, data: UpdateTenantInput): Promise<Tenant> =>
    apiFetch(`/api/tenants/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTenant: (id: string): Promise<{ success: true }> =>
    apiFetch(`/api/tenants/${id}`, { method: "DELETE" }),

  // Contracts
  getContracts: (): Promise<Contract[]> => apiFetch("/api/contracts"),
  createContract: (data: CreateContractInput): Promise<Contract> =>
    apiFetch("/api/contracts", { method: "POST", body: JSON.stringify(data) }),
  updateContract: (id: string, data: UpdateContractInput): Promise<Contract> =>
    apiFetch(`/api/contracts/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  presignContractUpload: (
    data: PresignContractUploadRequest
  ): Promise<PresignContractUploadResponse> =>
    apiFetch("/api/uploads/contract/presign", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getContractPdfUrl: (id: string, kind: "draft" | "signed" = "draft"): Promise<{ url: string }> =>
    apiFetch(`/api/contracts/${id}/pdf-url?kind=${kind}`),
  signContract: (id: string, data: { signedPdfUrl: string }): Promise<Contract> =>
    apiFetch(`/api/contracts/${id}/sign`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  finishContract: (id: string, data: { endDate: string }): Promise<Contract> =>
    apiFetch(`/api/contracts/${id}/finish`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteContract: (id: string): Promise<{ success: true }> =>
    apiFetch(`/api/contracts/${id}`, { method: "DELETE" }),

  // Payments
  getPayments: (filters?: Record<string, string>): Promise<Payment[]> => {
    const params = new URLSearchParams(filters || {})
    const query = params.toString() ? `?${params.toString()}` : ""
    return apiFetch(`/api/payments${query}`)
  },
  createPayment: (data: CreatePaymentInput): Promise<Payment> =>
    apiFetch("/api/payments", { method: "POST", body: JSON.stringify(data) }),
  presignPaymentProofUpload: (
    data: PresignPaymentProofRequest
  ): Promise<PresignPaymentProofResponse> =>
    apiFetch("/api/uploads/payment-proof/presign", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getPaymentProofUrl: (id: string): Promise<{ url: string }> =>
    apiFetch(`/api/payments/${id}/proof-url`),
  getPaymentReceipt: (id: string): Promise<Blob> => apiFetchBlob(`/api/payments/${id}/receipt`),
  updatePayment: (id: string, data: UpdatePaymentInput): Promise<Payment> =>
    apiFetch(`/api/payments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deletePayment: (id: string): Promise<{ success: true }> =>
    apiFetch(`/api/payments/${id}`, { method: "DELETE" }),
  getPaymentsReportPdf: (filters?: PaymentsReportFilters): Promise<Blob> => {
    const params = buildQueryParams(filters || {})
    const query = params.toString() ? `?${params.toString()}` : ""
    return apiFetchBlob(`/api/reports/payments${query}`)
  },
  sendPaymentsReportEmail: (data: SendPaymentsReportEmailInput): Promise<{ ok: true; sent: true }> =>
    apiFetch("/api/reports/payments", { method: "POST", body: JSON.stringify(data) }),

  // Settings
  getSettings: (): Promise<Settings> => apiFetch("/api/settings"),
  updateSettings: (data: Settings): Promise<Settings> =>
    apiFetch("/api/settings", { method: "PUT", body: JSON.stringify(data) }),
}
