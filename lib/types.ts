export interface House {
  id: string
  name: string
  address: string
}

export interface Tenant {
  id: string
  name: string
  email: string
  phone: string
  tenantTypeId: string
  tenantIdNumber: string
  houseId: string
  houseName: string
  parentName: string
  parentId: string
  parentAddress: string
  parentPhone: string
  guardianTypeId: string
  guardianIdNumber: string
}

export interface TenantAuthProvisioning {
  firebaseUserCreated: boolean
  passwordResetEmailSent?: boolean
}

export type CreateTenantResponse = Tenant & {
  auth?: TenantAuthProvisioning
}

export interface Contract {
  id: string
  tenantId: string
  tenantName: string
  startDate: string
  endDate: string
  monthlyPrice: number
  status: "ready_to_sign" | "signed" | "approved" | "finished"
  pdfUrl: string
  signedPdfUrl?: string
}

export interface Payment {
  id: string
  tenantId: string
  tenantName: string
  tenantEmail: string
  contractId: string
  houseName: string
  month: number
  year: number
  amount: number
  state: "pending" | "approved"
  proofImageUrl: string
  receiptUrl?: string
  createdAt: string
}

export interface Settings {
  adminEmails: string[]
  enableNotifications: boolean
  notificationEmails: string[]
  paymentDueDate: number
  legalRepresentativeName: string
  legalRepresentativeRole: string
  legalRepresentativeAddress: string
  legalRepresentativePhone: string
}

export type CreateHouseInput = Pick<House, "name" | "address">
export type UpdateHouseInput = Pick<House, "name" | "address">

export type CreateTenantInput = Omit<Tenant, "id">
export type UpdateTenantInput = Omit<Tenant, "id">

export type CreateContractInput = Pick<
  Contract,
  "tenantId" | "tenantName" | "startDate" | "endDate" | "monthlyPrice"
>

export type UpdateContractInput = Partial<
  Pick<
    Contract,
    "tenantId" | "tenantName" | "startDate" | "endDate" | "monthlyPrice" | "status" | "pdfUrl" | "signedPdfUrl"
  >
>

export type CreatePaymentInput = Pick<
  Payment,
  | "tenantId"
  | "tenantName"
  | "tenantEmail"
  | "contractId"
  | "houseName"
  | "month"
  | "year"
  | "amount"
  | "proofImageUrl"
>

export type UpdatePaymentStateInput = {
  state?: Payment["state"]
  receiptUrl?: string
}

export type UpdatePaymentInput = {
  state?: Payment["state"]
  receiptUrl?: string
  month?: number
  year?: number
  proofImageUrl?: string
}

