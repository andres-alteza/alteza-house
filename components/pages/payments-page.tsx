"use client"

import { useRef, useState } from "react"
import useSWR from "swr"
import { useI18n } from "@/lib/i18n-context"
import { useAuth } from "@/lib/auth-context"
import { api } from "@/lib/api-client"
import type { Contract, House, Payment, Tenant } from "@/lib/types"
import { DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { Modal } from "@/components/modal"
import { CheckCircle, XCircle, ImageIcon, Upload, Download, ChevronDown, Save, Loader2 } from "lucide-react"
import { toast } from "sonner"

const PDF_CONTENT_TYPE = "application/pdf"
const PDF_FILE_EXTENSION = ".pdf"

function inferContentTypeFromFileName(fileName: string) {
  return fileName.toLowerCase().endsWith(PDF_FILE_EXTENSION) ? PDF_CONTENT_TYPE : ""
}

function isAllowedProofFile(file: File) {
  const normalizedType = file.type.toLowerCase()
  if (normalizedType.startsWith("image/") || normalizedType === PDF_CONTENT_TYPE) {
    return true
  }
  return file.name.toLowerCase().endsWith(PDF_FILE_EXTENSION)
}

type ContractWindow = {
  year: number
  startMonth: number
  endMonth: number
}

function parseContractDate(value: string) {
  const [yearRaw, monthRaw] = value.split("-")
  const year = Number.parseInt(yearRaw ?? "", 10)
  const month = Number.parseInt(monthRaw ?? "", 10)
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null
  }
  return { year, month }
}

function buildContractWindow(contract: Contract, now: Date): ContractWindow | null {
  const startDate = parseContractDate(contract.startDate)
  const endDate = parseContractDate(contract.endDate)
  if (!startDate || !endDate) {
    return null
  }

  const currentYear = now.getFullYear()
  const startYear = startDate.year
  const endYear = endDate.year
  const year =
    currentYear >= startYear && currentYear <= endYear ? currentYear : startYear

  const startMonth = year === startYear ? startDate.month : 1
  const endMonth = year === endYear ? endDate.month : 12

  if (startMonth > endMonth) {
    return null
  }

  return { year, startMonth, endMonth }
}

function toLocalIsoDate(date: Date) {
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localTime.toISOString().slice(0, 10)
}

export function PaymentsPage() {
  const { t } = useI18n()
  const { isAdmin } = useAuth()
  const proofInputRef = useRef<HTMLInputElement | null>(null)
  const detailProofInputRef = useRef<HTMLInputElement | null>(null)
  const now = new Date()

  const { data: houses = [] } = useSWR<House[]>("houses", api.getHouses)
  const { data: contracts = [] } = useSWR<Contract[]>(!isAdmin ? "contracts" : null, api.getContracts)
  const { data: tenants = [] } = useSWR<Tenant[]>(!isAdmin ? "tenants" : null, api.getTenants)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [filterTenant, setFilterTenant] = useState("")
  const [filterHouse, setFilterHouse] = useState("")
  const [filterMonth, setFilterMonth] = useState("")
  const [filterYear, setFilterYear] = useState("")
  const [showFilters, setShowFilters] = useState(false)
  const [uploadMonth, setUploadMonth] = useState("")
  const [detailMonth, setDetailMonth] = useState("")
  const [uploadYear, setUploadYear] = useState("")
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [detailProofFile, setDetailProofFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState("")
  const [detailError, setDetailError] = useState("")
  const [uploading, setUploading] = useState(false)
  const [savingDetail, setSavingDetail] = useState(false)
  const [openingProof, setOpeningProof] = useState(false)
  const [openingReceipt, setOpeningReceipt] = useState(false)
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null)

  // Build API filters (server-side filtering for house, month, year)
  const apiFilters: Record<string, string> = {}
  if (filterHouse) apiFilters.houseName = filterHouse
  if (filterMonth) apiFilters.month = filterMonth
  if (filterYear) apiFilters.year = filterYear

  const { data: payments = [], mutate } = useSWR<Payment[]>(
    ["payments", apiFilters],
    () => api.getPayments(apiFilters)
  )

  // Client-side name filter
  const filteredPayments = filterTenant
    ? payments.filter((p) =>
        p.tenantName.toLowerCase().includes(filterTenant.toLowerCase())
      )
    : payments
  const tenantProfile = !isAdmin ? tenants[0] : undefined
  const localToday = toLocalIsoDate(now)
  const activeTenantContract = !isAdmin
    ? contracts.find(
        (contract) =>
          contract.tenantId === tenantProfile?.id &&
          contract.status === "approved" &&
          contract.startDate <= localToday &&
          contract.endDate >= localToday
      )
    : undefined
  const contractWindow = activeTenantContract
    ? buildContractWindow(activeTenantContract, now)
    : null
  const canUploadPaymentProof = !isAdmin && !!tenantProfile && !!activeTenantContract && !!contractWindow
  const approvedMonths = !isAdmin && activeTenantContract && contractWindow
    ? new Set(
        payments
          .filter(
            (payment) =>
              payment.contractId === activeTenantContract.id &&
              payment.year === contractWindow.year &&
              payment.state === "approved"
          )
          .map((payment) => payment.month)
      )
    : new Set<number>()
  const uploadMonthOptions = contractWindow
    ? Array.from(
        { length: contractWindow.endMonth - contractWindow.startMonth + 1 },
        (_, index) => contractWindow.startMonth + index
      ).filter((month) => !approvedMonths.has(month))
    : []
  const uploadYearLabel = contractWindow ? String(contractWindow.year) : ""
  const canTenantEditSelectedPayment = !isAdmin && selectedPayment?.state === "pending"
  const detailMonthOptions =
    canTenantEditSelectedPayment && selectedPayment
      ? Array.from(new Set([...uploadMonthOptions, selectedPayment.month])).sort((a, b) => a - b)
      : []
  const hasPendingChanges =
    canTenantEditSelectedPayment &&
    selectedPayment &&
    (Number(detailMonth) !== selectedPayment.month || !!detailProofFile)

  const columns = [
    { key: "tenantName", label: t("tenants.name") },
    { key: "houseName", label: t("tenants.house") },
    {
      key: "month",
      label: t("payments.month"),
      render: (p: Payment) => t(`month.${p.month}`),
    },
    { key: "year", label: t("payments.year") },
    {
      key: "amount",
      label: t("payments.amount"),
      render: (p: Payment) => `$${p.amount.toLocaleString()}`,
    },
    {
      key: "state",
      label: t("payments.state"),
      render: (p: Payment) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            p.state === "approved"
              ? "bg-success/10 text-success"
              : "bg-warning/10 text-warning"
          }`}
        >
          {p.state === "approved" ? t("payments.approved") : t("payments.pending")}
        </span>
      ),
    },
  ]

  const openDetail = (payment: Payment) => {
    setSelectedPayment(payment)
    setDetailMonth(String(payment.month))
    setDetailProofFile(null)
    setDetailError("")
    if (detailProofInputRef.current) {
      detailProofInputRef.current.value = ""
    }
    setIsDetailOpen(true)
  }

  const confirmPayment = async (paymentId: string) => {
    if (confirmingPaymentId) return

    setConfirmingPaymentId(paymentId)
    try {
      await api.updatePayment(paymentId, {
        state: "approved",
        receiptUrl: `/api/payments/${paymentId}/receipt`,
      })
      await mutate()
      setIsDetailOpen(false)
      toast.success(t("payments.confirmedSuccess"))
    } catch (err) {
      console.error("Confirm error:", err)
      toast.error(t("payments.confirmError"))
    } finally {
      setConfirmingPaymentId(null)
    }
  }

  const resetUploadForm = () => {
    const nextMonth = uploadMonthOptions[0]
    setUploadMonth(nextMonth ? String(nextMonth) : "")
    setUploadYear(uploadYearLabel)
    setProofFile(null)
    setUploadError("")
    setUploading(false)
    if (proofInputRef.current) {
      proofInputRef.current.value = ""
    }
  }

  const closeUploadModal = () => {
    setIsUploadOpen(false)
    resetUploadForm()
  }

  const closeDetailModal = () => {
    setIsDetailOpen(false)
    setDetailProofFile(null)
    setDetailError("")
    setSavingDetail(false)
    if (detailProofInputRef.current) {
      detailProofInputRef.current.value = ""
    }
  }

  const openUploadModal = () => {
    const nextMonth = uploadMonthOptions[0]
    setUploadMonth(nextMonth ? String(nextMonth) : "")
    setUploadYear(uploadYearLabel)
    setUploadError("")
    setProofFile(null)
    if (proofInputRef.current) {
      proofInputRef.current.value = ""
    }
    setIsUploadOpen(true)
  }

  const handleProofFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      setProofFile(null)
      return
    }
    if (!isAllowedProofFile(file)) {
      setUploadError(t("payments.invalidProofError"))
      toast.error(t("payments.invalidProofError"))
      setProofFile(null)
      event.target.value = ""
      return
    }

    setUploadError("")
    setProofFile(file)
  }

  const handleDetailProofFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      setDetailProofFile(null)
      return
    }
    if (!isAllowedProofFile(file)) {
      setDetailError(t("payments.invalidProofError"))
      toast.error(t("payments.invalidProofError"))
      setDetailProofFile(null)
      event.target.value = ""
      return
    }
    setDetailError("")
    setDetailProofFile(file)
  }

  const handleUploadSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!proofFile) {
      setUploadError(t("payments.proofRequiredError"))
      toast.error(t("payments.proofRequiredError"))
      return
    }
    if (!tenantProfile || !activeTenantContract) {
      setUploadError(t("payments.missingContractError"))
      toast.error(t("payments.missingContractError"))
      return
    }
    if (!uploadYearLabel || !uploadMonthOptions.length || !uploadMonth) {
      setUploadError(t("payments.missingContractError"))
      toast.error(t("payments.missingContractError"))
      return
    }

    const contentType = proofFile.type || inferContentTypeFromFileName(proofFile.name)
    if (!contentType) {
      setUploadError(t("payments.invalidProofError"))
      toast.error(t("payments.invalidProofError"))
      return
    }

    setUploading(true)
    setUploadError("")
    try {
      const paymentId = crypto.randomUUID()
      const month = Number(uploadMonth)
      const year = Number(uploadYear)

      const presign = await api.presignPaymentProofUpload({
        filename: proofFile.name,
        contentType,
        tenantId: tenantProfile.id,
        paymentId,
        year,
        month,
      })

      const uploadResponse = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": presign.contentType },
        body: proofFile,
      })

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed with status ${uploadResponse.status}`)
      }

      await api.createPayment({
        tenantId: tenantProfile.id,
        tenantName: tenantProfile.name,
        tenantEmail: tenantProfile.email,
        contractId: activeTenantContract.id,
        houseName: tenantProfile.houseName,
        month,
        year,
        amount: activeTenantContract.monthlyPrice,
        proofImageUrl: presign.objectKey,
      })

      await mutate()
      closeUploadModal()
      toast.success(t("payments.uploadSuccess"))
    } catch (error) {
      console.error("Upload payment proof error:", error)
      setUploadError(t("payments.uploadError"))
      toast.error(t("payments.uploadError"))
      setUploading(false)
    }
  }

  const handlePendingPaymentSave = async () => {
    if (!selectedPayment || isAdmin || selectedPayment.state !== "pending") {
      return
    }

    const month = Number(detailMonth)
    if (!month || !detailMonthOptions.includes(month)) {
      setDetailError(t("payments.missingContractError"))
      toast.error(t("payments.missingContractError"))
      return
    }

    setSavingDetail(true)
    setDetailError("")
    try {
      const updatePayload: {
        month?: number
        year?: number
        proofImageUrl?: string
      } = {}

      if (month !== selectedPayment.month) {
        updatePayload.month = month
        updatePayload.year = selectedPayment.year
      }

      if (detailProofFile) {
        const contentType =
          detailProofFile.type || inferContentTypeFromFileName(detailProofFile.name)
        if (!contentType) {
          throw new Error(t("payments.invalidProofError"))
        }
        const presign = await api.presignPaymentProofUpload({
          filename: detailProofFile.name,
          contentType,
          tenantId: selectedPayment.tenantId,
          paymentId: selectedPayment.id,
          year: selectedPayment.year,
          month,
        })
        const uploadResponse = await fetch(presign.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": presign.contentType },
          body: detailProofFile,
        })
        if (!uploadResponse.ok) {
          throw new Error(`Upload failed with status ${uploadResponse.status}`)
        }
        updatePayload.proofImageUrl = presign.objectKey
      }

      if (!Object.keys(updatePayload).length) {
        setSavingDetail(false)
        return
      }

      const updated = await api.updatePayment(selectedPayment.id, updatePayload)
      setSelectedPayment(updated)
      await mutate()
      toast.success(t("payments.updateSuccess"))
      closeDetailModal()
    } catch (error) {
      console.error("Update payment error:", error)
      setDetailError(t("payments.updateError"))
      toast.error(t("payments.updateError"))
      setSavingDetail(false)
    }
  }

  const openProofFile = async (paymentId: string) => {
    setOpeningProof(true)
    try {
      const data = await api.getPaymentProofUrl(paymentId)
      const response = await fetch(data.url)
      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}`)
      }
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = objectUrl
      anchor.download = `payment-proof-${paymentId}`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000)
      toast.success(t("general.openedSuccess"))
    } catch (error) {
      console.error("Open payment proof error:", error)
      toast.error(t("payments.openProofError"))
    } finally {
      setOpeningProof(false)
    }
  }

  const openReceiptFile = async (paymentId: string) => {
    if (openingReceipt) return
    setOpeningReceipt(true)
    try {
      const blob = await api.getPaymentReceipt(paymentId)
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = objectUrl
      anchor.download = `receipt-${paymentId}.pdf`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()

      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000)
      toast.success(t("general.openedSuccess"))
    } catch (error) {
      console.error("Open receipt error:", error)
      toast.error(t("general.openError"))
    } finally {
      setOpeningReceipt(false)
    }
  }

  const inputClass =
    "rounded-lg border border-input bg-card px-4 py-2.5 text-sm text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
  const filterSelectClass = `${inputClass} w-full appearance-none pr-10`

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("payments.title")}
        filterLabel={t("payments.filter")}
        onFilter={() => setShowFilters(!showFilters)}
        createLabel={!isAdmin ? t("payments.upload") : undefined}
        onCreate={!isAdmin ? openUploadModal : undefined}
        createDisabled={!isAdmin && !canUploadPaymentProof}
      />

      {/* Filters */}
      {showFilters && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t("tenants.name")}</label>
              <input
                type="text"
                value={filterTenant}
                onChange={(e) => setFilterTenant(e.target.value)}
                placeholder={t("general.search")}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t("tenants.house")}</label>
              <div className="relative">
                <select
                  value={filterHouse}
                  onChange={(e) => setFilterHouse(e.target.value)}
                  className={filterSelectClass}
                >
                  <option value="">--</option>
                  {houses.map((house) => (
                    <option key={house.id} value={house.name}>
                      {house.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t("payments.month")}</label>
              <div className="relative">
                <select
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  className={filterSelectClass}
                >
                  <option value="">--</option>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {t(`month.${i + 1}`)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t("payments.year")}</label>
              <div className="relative">
                <select
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                  className={filterSelectClass}
                >
                  <option value="">--</option>
                  <option value="2025">2025</option>
                  <option value="2026">2026</option>
                  <option value="2027">2027</option>
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card">
        <DataTable
          columns={columns}
          data={filteredPayments}
          onView={openDetail}
          actions={
            isAdmin
              ? (payment: Payment) =>
                  payment.state === "pending" ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        void confirmPayment(payment.id)
                      }}
                      disabled={confirmingPaymentId === payment.id}
                      className="rounded p-1.5 text-success transition-colors hover:bg-success/10 disabled:opacity-50"
                      aria-label="Confirm payment"
                    >
                      {confirmingPaymentId === payment.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle className="h-4 w-4" />
                      )}
                    </button>
                  ) : null
              : undefined
          }
        />
      </div>

      {/* Detail Modal */}
      <Modal
        isOpen={isDetailOpen}
        onClose={closeDetailModal}
        title={`${t("payments.title")} - ${selectedPayment?.tenantName || ""}`}
        size="lg"
      >
        {selectedPayment && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoField label={t("tenants.name")} value={selectedPayment.tenantName} />
              <InfoField label={t("tenants.email")} value={selectedPayment.tenantEmail} />
              <InfoField label={t("tenants.house")} value={selectedPayment.houseName} />
              {canTenantEditSelectedPayment ? (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("payments.month")}
                  </span>
                  <div className="relative">
                    <select
                      value={detailMonth}
                      onChange={(e) => setDetailMonth(e.target.value)}
                      className={`${inputClass} w-full appearance-none pr-10`}
                    >
                      {detailMonthOptions.map((month) => (
                        <option key={month} value={month}>
                          {t(`month.${month}`)} {selectedPayment.year}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
              ) : (
                <InfoField
                  label={t("payments.month")}
                  value={`${t(`month.${selectedPayment.month}`)} ${selectedPayment.year}`}
                />
              )}
              <InfoField
                label={t("payments.amount")}
                value={`$${selectedPayment.amount.toLocaleString()}`}
              />
              <InfoField
                label={t("payments.state")}
                value={
                  selectedPayment.state === "approved"
                    ? t("payments.approved")
                    : t("payments.pending")
                }
              />
            </div>

            {selectedPayment.state !== "approved" && (
              <div className="border-t border-border pt-4">
                <p className="mb-2 text-sm font-medium text-card-foreground">{t("payments.proofImage")}</p>
                <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30">
                  <div className="text-center text-muted-foreground">
                    <ImageIcon className="mx-auto h-10 w-10 opacity-40" />
                    {canTenantEditSelectedPayment && (
                      <>
                        <input
                          ref={detailProofInputRef}
                          type="file"
                          accept=".pdf,image/*"
                          onChange={handleDetailProofFileChange}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => detailProofInputRef.current?.click()}
                          disabled={savingDetail}
                          className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-card-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          {detailProofFile?.name || t("payments.changeProof")}
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => openProofFile(selectedPayment.id)}
                      disabled={!selectedPayment.proofImageUrl || openingProof}
                      className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-card-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {openingProof ? t("general.loading") : t("general.download")}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {detailError && <p className="text-sm text-destructive">{detailError}</p>}
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              {isAdmin && selectedPayment.state === "pending" && (
                <>
                  <button
                    type="button"
                    onClick={() => void confirmPayment(selectedPayment.id)}
                    disabled={confirmingPaymentId === selectedPayment.id}
                    className="inline-flex items-center gap-2 rounded-lg bg-success px-4 py-2 text-sm font-medium text-success-foreground transition-colors hover:bg-success/90 disabled:opacity-50"
                  >
                    {confirmingPaymentId === selectedPayment.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4" />
                    )}
                    {confirmingPaymentId === selectedPayment.id
                      ? t("general.loading")
                      : t("payments.confirm")}
                  </button>
                </>
              )}
              {canTenantEditSelectedPayment && (
                <button
                  type="button"
                  onClick={handlePendingPaymentSave}
                  disabled={savingDetail || !hasPendingChanges}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {savingDetail ? t("general.loading") : t("general.save")}
                </button>
              )}
              {selectedPayment.state === "approved" && selectedPayment.receiptUrl && (
                <button
                  type="button"
                  onClick={() => void openReceiptFile(selectedPayment.id)}
                  disabled={openingReceipt}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  {openingReceipt ? t("general.loading") : t("payments.downloadReceipt")}
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Upload Modal (Tenant) */}
      <Modal
        isOpen={isUploadOpen}
        onClose={closeUploadModal}
        title={t("payments.upload")}
      >
        <form onSubmit={handleUploadSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-card-foreground">
                {t("payments.month")} <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <select
                  value={uploadMonth}
                  onChange={(e) => setUploadMonth(e.target.value)}
                  required
                  disabled={!uploadMonthOptions.length}
                  className={`${inputClass} w-full appearance-none pr-10`}
                >
                  {uploadMonthOptions.map((month) => (
                    <option key={month} value={month}>
                      {t(`month.${month}`)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-card-foreground">{t("payments.year")}</label>
              <div className={`${inputClass} flex min-h-[42px] w-full items-center`}>
                {uploadYear || "-"}
              </div>
            </div>
          </div>
          {!uploadMonthOptions.length && (
            <p className="text-sm text-muted-foreground">{t("payments.missingContractError")}</p>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-card-foreground">
              {t("payments.proofImage")} <span className="text-destructive">*</span>
            </label>
            <input
              ref={proofInputRef}
              type="file"
              accept=".pdf,image/*"
              onChange={handleProofFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => proofInputRef.current?.click()}
              disabled={!canUploadPaymentProof}
              className="flex h-32 w-full items-center justify-center rounded-lg border-2 border-dashed border-border transition-colors hover:border-primary hover:bg-primary/5"
            >
              <div className="text-center text-muted-foreground">
                <Upload className="mx-auto h-8 w-8 opacity-50" />
                <p className="mt-1 text-xs">
                  {proofFile?.name || `${t("general.upload")} (.pdf, image/*)`}
                </p>
              </div>
            </button>
          </div>
          {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeUploadModal}
              disabled={uploading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-muted sm:w-auto"
            >
              {t("general.cancel")}
            </button>
            <button
              type="submit"
              disabled={uploading || !canUploadPaymentProof}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 sm:w-auto"
            >
              <Upload className="h-4 w-4" />
              {uploading ? t("general.loading") : t("payments.upload")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-card-foreground">
        {value || "-"}
      </span>
    </div>
  )
}
