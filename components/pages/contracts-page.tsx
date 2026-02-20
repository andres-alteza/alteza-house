"use client"

import { useRef, useState } from "react"
import useSWR from "swr"
import { useI18n } from "@/lib/i18n-context"
import { useAuth } from "@/lib/auth-context"
import { api } from "@/lib/api-client"
import type { Contract, Tenant } from "@/lib/types"
import { DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { Modal } from "@/components/modal"
import { Save, X, Download, Upload, Eye, Pencil, CheckCircle, ChevronDown, Trash2, Loader2 } from "lucide-react"
import { toast } from "sonner"

const PDF_CONTENT_TYPE = "application/pdf"
const PDF_FILE_EXTENSION = ".pdf"

function isPdfFile(file: File) {
  return file.type.toLowerCase() === PDF_CONTENT_TYPE || file.name.toLowerCase().endsWith(PDF_FILE_EXTENSION)
}

function suggestContractEndDate(startDate: string) {
  if (!startDate) return ""

  const [year, month] = startDate.split("-").map(Number)
  if (!year || !month) return ""

  const targetMonth = month - 1 + 6
  const endOfTargetMonth = new Date(Date.UTC(year, targetMonth + 1, 0))
  return endOfTargetMonth.toISOString().slice(0, 10)
}

export function ContractsPage() {
  const { t } = useI18n()
  const { isAdmin } = useAuth()
  const { data: contracts = [], mutate } = useSWR<Contract[]>("contracts", api.getContracts)
  const { data: tenants = [] } = useSWR<Tenant[]>("tenants", api.getTenants)
  const signedInputRef = useRef<HTMLInputElement | null>(null)
  const draftInputRef = useRef<HTMLInputElement | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [detailMode, setDetailMode] = useState<"view" | "edit">("view")
  const [saving, setSaving] = useState(false)
  const [detailSaving, setDetailSaving] = useState(false)
  const [createError, setCreateError] = useState("")
  const [createDraftFile, setCreateDraftFile] = useState<File | null>(null)
  const [uploadingDraft, setUploadingDraft] = useState(false)
  const [uploadingSigned, setUploadingSigned] = useState(false)
  const [openingDraft, setOpeningDraft] = useState(false)
  const [openingSigned, setOpeningSigned] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [approvingContractId, setApprovingContractId] = useState<string | null>(null)
  const [deletingContractId, setDeletingContractId] = useState<string | null>(null)
  const [detailError, setDetailError] = useState("")
  const [filterTenant, setFilterTenant] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [filterDateStart, setFilterDateStart] = useState("")
  const [filterDateEnd, setFilterDateEnd] = useState("")
  const [showFilters, setShowFilters] = useState(false)

  const [formData, setFormData] = useState({
    tenantId: "",
    startDate: "",
    endDate: "",
    monthlyPrice: "",
  })
  const [detailFormData, setDetailFormData] = useState<{
    tenantId: string
    startDate: string
    endDate: string
    monthlyPrice: string
    status: Contract["status"]
  }>({
    tenantId: "",
    startDate: "",
    endDate: "",
    monthlyPrice: "",
    status: "ready_to_sign",
  })

  const columns = [
    { key: "tenantName", label: t("contracts.tenant") },
    { key: "startDate", label: t("contracts.startDate") },
    { key: "endDate", label: t("contracts.endDate") },
    {
      key: "monthlyPrice",
      label: t("contracts.monthlyPrice"),
      render: (c: Contract) => `$${c.monthlyPrice.toLocaleString()}`,
    },
    {
      key: "status",
      label: t("contracts.status"),
      render: (c: Contract) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            c.status === "approved"
              ? "bg-primary/10 text-primary"
              : c.status === "finished"
                ? "bg-muted text-muted-foreground"
              : c.status === "signed"
                ? "bg-success/10 text-success"
                : "bg-warning/10 text-warning"
          }`}
        >
          {c.status === "approved"
            ? t("contracts.status.approved")
            : c.status === "finished"
              ? t("contracts.status.finished")
            : c.status === "signed"
              ? t("contracts.status.signed")
              : t("contracts.status.readyToSign")}
        </span>
      ),
    },
  ]
  const filteredContracts = contracts.filter((contract) => {
    const matchesTenant = filterTenant
      ? contract.tenantName.toLowerCase().includes(filterTenant.toLowerCase())
      : true
    const matchesStatus = filterStatus ? contract.status === filterStatus : true
    const matchesRangeStart = filterDateStart ? contract.startDate >= filterDateStart : true
    const matchesRangeEnd = filterDateEnd ? contract.endDate <= filterDateEnd : true
    return matchesTenant && matchesStatus && matchesRangeStart && matchesRangeEnd
  })

  const openCreate = () => {
    setFormData({
      tenantId: tenants[0]?.id || "",
      startDate: "",
      endDate: "",
      monthlyPrice: "",
    })
    setCreateDraftFile(null)
    setCreateError("")
    setIsModalOpen(true)
  }

  const openDetail = (contract: Contract, mode: "view" | "edit") => {
    setSelectedContract(contract)
    setDetailMode(mode)
    setDetailFormData({
      tenantId: contract.tenantId,
      startDate: contract.startDate,
      endDate: contract.endDate,
      monthlyPrice: String(contract.monthlyPrice),
      status: contract.status,
    })
    setDetailError("")
    setIsDetailOpen(true)
  }

  const isContractLocked = (contract: Contract) =>
    contract.status === "approved" || contract.status === "finished"
  const canDeleteContract = (contract: Contract) => isAdmin && !isContractLocked(contract)

  const openViewDetail = (contract: Contract) => openDetail(contract, "view")

  const openEditDetail = (contract: Contract) => {
    if (isContractLocked(contract)) {
      openDetail(contract, "view")
      return
    }
    openDetail(contract, "edit")
  }

  const refreshContracts = async (contractId?: string) => {
    const updated = await mutate()
    if (!contractId || !updated) return
    const current = updated.find((contract) => contract.id === contractId) ?? null
    setSelectedContract(current)
    if (current) {
      setDetailFormData({
        tenantId: current.tenantId,
        startDate: current.startDate,
        endDate: current.endDate,
        monthlyPrice: String(current.monthlyPrice),
        status: current.status,
      })
    }
  }

  const handleSave = async () => {
    if (createDraftFile && !isPdfFile(createDraftFile)) {
      setCreateError(t("contracts.invalidPdfError"))
      toast.error(t("contracts.invalidPdfError"))
      return
    }

    setSaving(true)
    setCreateError("")
    try {
      const tenant = tenants.find((ten) => ten.id === formData.tenantId)
      const createdContract = await api.createContract({
        tenantId: formData.tenantId,
        tenantName: tenant?.name || "",
        startDate: formData.startDate,
        endDate: formData.endDate,
        monthlyPrice: Number(formData.monthlyPrice),
      })

      if (createDraftFile) {
        try {
          const presign = await api.presignContractUpload({
            contractId: createdContract.id,
            filename: createDraftFile.name,
            contentType: createDraftFile.type || PDF_CONTENT_TYPE,
            kind: "draft",
          })
          const uploadResponse = await fetch(presign.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": presign.contentType },
            body: createDraftFile,
          })
          if (!uploadResponse.ok) {
            throw new Error(`Upload failed with status ${uploadResponse.status}`)
          }
        } catch (uploadError) {
          console.error("Create contract draft upload error:", uploadError)
          toast.error(t("contracts.createUploadPartialError"))
        }
      }

      await refreshContracts()
      setIsModalOpen(false)
      toast.success(t("contracts.createdSuccess"))
    } catch (err) {
      console.error("Save error:", err)
      setCreateError(t("contracts.createError"))
      toast.error(t("contracts.createError"))
    } finally {
      setSaving(false)
    }
  }

  const updateContract = async () => {
    if (
      !selectedContract ||
      !isAdmin ||
      detailMode !== "edit" ||
      isContractLocked(selectedContract)
    ) {
      return
    }
    setDetailSaving(true)
    setDetailError("")
    try {
      const tenant = tenants.find((ten) => ten.id === detailFormData.tenantId)
      await api.updateContract(selectedContract.id, {
        tenantId: detailFormData.tenantId,
        tenantName: tenant?.name || selectedContract.tenantName,
        startDate: detailFormData.startDate,
        endDate: detailFormData.endDate,
        monthlyPrice: Number(detailFormData.monthlyPrice),
        status: detailFormData.status,
      })
      await refreshContracts(selectedContract.id)
      toast.success(t("contracts.updatedSuccess"))
    } catch (error) {
      console.error("Update contract error:", error)
      setDetailError(t("contracts.updateError"))
      toast.error(t("contracts.updateError"))
    } finally {
      setDetailSaving(false)
    }
  }

  const uploadContractFile = async (file: File, kind: "draft" | "signed") => {
    if (!selectedContract) return
    if (!isPdfFile(file)) {
      setDetailError(t("contracts.invalidPdfError"))
      toast.error(t("contracts.invalidPdfError"))
      return
    }

    if (kind === "draft") {
      setUploadingDraft(true)
    } else {
      setUploadingSigned(true)
    }
    setDetailError("")

    try {
      const presign = await api.presignContractUpload({
        contractId: selectedContract.id,
        filename: file.name,
        contentType: file.type || PDF_CONTENT_TYPE,
        kind,
      })

      const uploadResponse = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": presign.contentType },
        body: file,
      })
      if (!uploadResponse.ok) {
        throw new Error(`Upload failed with status ${uploadResponse.status}`)
      }

      toast.success(kind === "draft" ? t("contracts.draftUploadedSuccess") : t("contracts.signedUploadedSuccess"))

      await refreshContracts(selectedContract.id)
    } catch (error) {
      console.error("Upload contract file error:", error)
      setDetailError(t("contracts.uploadError"))
      toast.error(t("contracts.uploadError"))
    } finally {
      if (kind === "draft") {
        setUploadingDraft(false)
      } else {
        setUploadingSigned(false)
      }
    }
  }

  const handleSignedFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    await uploadContractFile(file, "signed")
    event.target.value = ""
  }

  const handleDraftFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    await uploadContractFile(file, "draft")
    event.target.value = ""
  }

  const openContractFile = async (kind: "draft" | "signed") => {
    if (!selectedContract) return
    if (kind === "draft") {
      setOpeningDraft(true)
    } else {
      setOpeningSigned(true)
    }
    setDetailError("")
    try {
      const data = await api.getContractPdfUrl(selectedContract.id, kind)
      const response = await fetch(data.url)
      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}`)
      }
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = objectUrl
      anchor.download = `contract-${selectedContract.id}-${kind}.pdf`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000)
      toast.success(t("general.openedSuccess"))
    } catch (error) {
      console.error("Open contract file error:", error)
      setDetailError(t("contracts.openError"))
      toast.error(t("contracts.openError"))
    } finally {
      if (kind === "draft") {
        setOpeningDraft(false)
      } else {
        setOpeningSigned(false)
      }
    }
  }

  const getCurrentLocalDate = () => {
    const now = new Date()
    const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    return localTime.toISOString().slice(0, 10)
  }

  const finishContract = async () => {
    if (!selectedContract || !isAdmin || selectedContract.status !== "approved") return

    setFinishing(true)
    setDetailError("")
    try {
      await api.finishContract(selectedContract.id, { endDate: getCurrentLocalDate() })
      await refreshContracts(selectedContract.id)
      toast.success(t("contracts.finishedSuccess"))
    } catch (error) {
      console.error("Finish contract error:", error)
      setDetailError(t("contracts.finishError"))
      toast.error(t("contracts.finishError"))
    } finally {
      setFinishing(false)
    }
  }

  const approveContract = async (contract: Contract) => {
    if (!isAdmin || contract.status !== "signed" || approvingContractId) return

    setApprovingContractId(contract.id)
    try {
      await api.updateContract(contract.id, { status: "approved" })
      await refreshContracts(contract.id)
      toast.success(t("contracts.updatedSuccess"))
    } catch (error) {
      console.error("Approve contract error:", error)
      toast.error(t("contracts.updateError"))
    } finally {
      setApprovingContractId(null)
    }
  }

  const deleteContract = async (contract: Contract) => {
    if (!canDeleteContract(contract)) return
    const confirmed = window.confirm(t("contracts.deleteConfirm"))
    if (!confirmed) return

    setDeletingContractId(contract.id)
    try {
      await api.deleteContract(contract.id)
      if (selectedContract?.id === contract.id) {
        setIsDetailOpen(false)
        setSelectedContract(null)
      }
      await refreshContracts()
      toast.success(t("contracts.deletedSuccess"))
    } catch (error) {
      console.error("Delete contract error:", error)
      toast.error(t("contracts.deleteError"))
    } finally {
      setDeletingContractId(null)
    }
  }

  const inputClass =
    "rounded-lg border border-input bg-card px-4 py-2.5 text-sm text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
  const filterSelectClass = `${inputClass} w-full appearance-none pr-10`

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("contracts.title")}
        filterLabel={t("contracts.filter")}
        onFilter={() => setShowFilters(!showFilters)}
        createLabel={isAdmin ? t("contracts.create") : undefined}
        onCreate={isAdmin ? openCreate : undefined}
      />

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
              <label className="text-xs font-medium text-muted-foreground">{t("contracts.status")}</label>
              <div className="relative">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className={filterSelectClass}
                >
                  <option value="">--</option>
                  <option value="ready_to_sign">{t("contracts.status.readyToSign")}</option>
                  <option value="signed">{t("contracts.status.signed")}</option>
                  <option value="approved">{t("contracts.status.approved")}</option>
                  <option value="finished">{t("contracts.status.finished")}</option>
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("contracts.startDate")}
              </label>
              <input
                type="date"
                value={filterDateStart}
                onChange={(e) => setFilterDateStart(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("contracts.endDate")}
              </label>
              <input
                type="date"
                value={filterDateEnd}
                onChange={(e) => setFilterDateEnd(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card">
        <DataTable
          columns={columns}
          data={filteredContracts}
          actions={(contract) => {
            if (!isContractLocked(contract)) {
              return (
                <div className="flex items-center gap-1">
                  {isAdmin && contract.status === "signed" && (
                    <button
                      type="button"
                      onClick={() => void approveContract(contract)}
                      disabled={approvingContractId === contract.id}
                      className="rounded p-1.5 text-success transition-colors hover:bg-success/10 disabled:opacity-50"
                      aria-label="Approve"
                    >
                      {approvingContractId === contract.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle className="h-4 w-4" />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => (isAdmin ? openEditDetail(contract) : openViewDetail(contract))}
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                    aria-label="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  {canDeleteContract(contract) && (
                    <button
                      type="button"
                      onClick={() => deleteContract(contract)}
                      disabled={deletingContractId === contract.id}
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )
            }

            return (
              <button
                type="button"
                onClick={() => openViewDetail(contract)}
                className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                aria-label="View"
              >
                <Eye className="h-4 w-4" />
              </button>
            )
          }}
        />
      </div>

      {/* Create Modal (Admin) */}
      {isAdmin && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={t("contracts.create")}
          size="lg"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSave()
            }}
            className="flex flex-col gap-4"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="contractTenant" className="text-sm font-medium text-card-foreground">
                  {t("contracts.tenant")} <span className="text-destructive">*</span>
                </label>
                <select
                  id="contractTenant"
                  value={formData.tenantId}
                  onChange={(e) => setFormData({ ...formData, tenantId: e.target.value })}
                  required
                  className={inputClass}
                >
                  <option value="">--</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="contractPrice" className="text-sm font-medium text-card-foreground">
                  {t("contracts.monthlyPrice")} <span className="text-destructive">*</span>
                </label>
                <input
                  id="contractPrice"
                  type="number"
                  value={formData.monthlyPrice}
                  onChange={(e) => setFormData({ ...formData, monthlyPrice: e.target.value })}
                  required
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="contractStart" className="text-sm font-medium text-card-foreground">
                  {t("contracts.startDate")} <span className="text-destructive">*</span>
                </label>
                <input
                  id="contractStart"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => {
                    const startDate = e.target.value
                    setFormData((prev) => ({
                      ...prev,
                      startDate,
                      endDate: suggestContractEndDate(startDate),
                    }))
                  }}
                  required
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="contractEnd" className="text-sm font-medium text-card-foreground">
                  {t("contracts.endDate")} <span className="text-destructive">*</span>
                </label>
                <input
                  id="contractEnd"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  required
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label htmlFor="contractDraftFile" className="text-sm font-medium text-card-foreground">
                  {t("contracts.uploadDraft")}
                </label>
                <input
                  id="contractDraftFile"
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(e) => setCreateDraftFile(e.target.files?.[0] ?? null)}
                  className={inputClass}
                />
              </div>
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-muted sm:w-auto"
              >
                <X className="h-4 w-4" />
                {t("general.cancel")}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 sm:w-auto"
              >
                <Save className="h-4 w-4" />
                {saving ? t("general.loading") : t("general.save")}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Detail Modal */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={t("contracts.viewContract")}
        size="lg"
      >
        {selectedContract && (
          <div className="flex flex-col gap-4">
            {isAdmin && detailMode === "edit" && !isContractLocked(selectedContract) ? (
              <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/30 p-3">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="detailContractTenant" className="text-sm font-medium text-card-foreground">
                      {t("contracts.tenant")} <span className="text-destructive">*</span>
                    </label>
                    <select
                      id="detailContractTenant"
                      value={detailFormData.tenantId}
                      onChange={(e) =>
                        setDetailFormData((prev) => ({ ...prev, tenantId: e.target.value }))
                      }
                      required
                      className={inputClass}
                    >
                      <option value="">--</option>
                      {tenants.map((tenant) => (
                        <option key={tenant.id} value={tenant.id}>
                          {tenant.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="detailContractPrice" className="text-sm font-medium text-card-foreground">
                      {t("contracts.monthlyPrice")} <span className="text-destructive">*</span>
                    </label>
                    <input
                      id="detailContractPrice"
                      type="number"
                      value={detailFormData.monthlyPrice}
                      onChange={(e) =>
                        setDetailFormData((prev) => ({ ...prev, monthlyPrice: e.target.value }))
                      }
                      required
                      className={inputClass}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="detailContractStart" className="text-sm font-medium text-card-foreground">
                      {t("contracts.startDate")} <span className="text-destructive">*</span>
                    </label>
                    <input
                      id="detailContractStart"
                      type="date"
                      value={detailFormData.startDate}
                      onChange={(e) =>
                        setDetailFormData((prev) => ({ ...prev, startDate: e.target.value }))
                      }
                      required
                      className={inputClass}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="detailContractEnd" className="text-sm font-medium text-card-foreground">
                      {t("contracts.endDate")} <span className="text-destructive">*</span>
                    </label>
                    <input
                      id="detailContractEnd"
                      type="date"
                      value={detailFormData.endDate}
                      onChange={(e) =>
                        setDetailFormData((prev) => ({ ...prev, endDate: e.target.value }))
                      }
                      required
                      className={inputClass}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="contractStatus" className="text-sm font-medium text-card-foreground">
                    {t("contracts.status")}
                  </label>
                  <select
                    id="contractStatus"
                    value={detailFormData.status}
                    onChange={(e) =>
                      setDetailFormData((prev) => ({
                        ...prev,
                        status: e.target.value as Contract["status"],
                      }))
                    }
                    className={`${inputClass} w-full sm:max-w-xs`}
                  >
                    <option value="ready_to_sign">{t("contracts.status.readyToSign")}</option>
                    <option value="signed">{t("contracts.status.signed")}</option>
                    <option value="approved">{t("contracts.status.approved")}</option>
                  </select>
                </div>
                <div className="flex border-t border-border pt-4 sm:justify-end">
                  <button
                    type="button"
                    onClick={updateContract}
                    disabled={detailSaving}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 sm:w-auto"
                  >
                    <Save className="h-4 w-4" />
                    {detailSaving ? t("general.loading") : t("general.save")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <InfoField label={t("contracts.tenant")} value={selectedContract.tenantName} />
                <InfoField
                  label={t("contracts.monthlyPrice")}
                  value={`$${selectedContract.monthlyPrice.toLocaleString()}`}
                />
                <InfoField label={t("contracts.startDate")} value={selectedContract.startDate} />
                <InfoField label={t("contracts.endDate")} value={selectedContract.endDate} />
                <InfoField
                  label={t("contracts.status")}
                  value={
                    selectedContract.status === "approved"
                      ? t("contracts.status.approved")
                      : selectedContract.status === "finished"
                        ? t("contracts.status.finished")
                      : selectedContract.status === "signed"
                        ? t("contracts.status.signed")
                        : t("contracts.status.readyToSign")
                  }
                />
              </div>
            )}
            {detailError && <p className="text-sm text-destructive">{detailError}</p>}
            {isAdmin && !isContractLocked(selectedContract) && (
              <input
                ref={draftInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleDraftFileChange}
                className="hidden"
              />
            )}
            {!isAdmin && selectedContract.status === "ready_to_sign" && !isContractLocked(selectedContract) && (
              <>
                <input
                  ref={signedInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleSignedFileChange}
                  className="hidden"
                />
              </>
            )}
            {selectedContract.status === "approved" || selectedContract.status === "finished" ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                {!!selectedContract.signedPdfUrl && (
                  <button
                    type="button"
                    onClick={() => openContractFile("signed")}
                    disabled={openingSigned || finishing}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    {openingSigned ? t("general.loading") : t("contracts.downloadSigned")}
                  </button>
                )}
                {isAdmin && selectedContract.status === "approved" && (
                  <button
                    type="button"
                    onClick={finishContract}
                    disabled={finishing}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                    <CheckCircle className="h-4 w-4" />
                    {finishing ? t("general.loading") : t("contracts.finish")}
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                {isAdmin && !isContractLocked(selectedContract) && (
                  <button
                    type="button"
                    onClick={() => draftInputRef.current?.click()}
                    disabled={uploadingDraft}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4" />
                    {uploadingDraft ? t("general.loading") : t("contracts.uploadDraft")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openContractFile("draft")}
                  disabled={!selectedContract.pdfUrl || openingDraft}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Download className="h-4 w-4" />
                  {openingDraft ? t("general.loading") : t("contracts.downloadDraft")}
                </button>
                {!!selectedContract.signedPdfUrl && (
                  <button
                    type="button"
                    onClick={() => openContractFile("signed")}
                    disabled={openingSigned}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-muted"
                  >
                    <Download className="h-4 w-4" />
                    {openingSigned ? t("general.loading") : t("contracts.downloadSigned")}
                  </button>
                )}
                {!isAdmin && selectedContract.status === "ready_to_sign" && !isContractLocked(selectedContract) && (
                  <button
                    type="button"
                    onClick={() => signedInputRef.current?.click()}
                    disabled={uploadingSigned}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4" />
                    {uploadingSigned ? t("general.loading") : t("contracts.uploadSigned")}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
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
