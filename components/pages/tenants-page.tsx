"use client"

import { useState } from "react"
import useSWR from "swr"
import { useI18n } from "@/lib/i18n-context"
import { api } from "@/lib/api-client"
import type { Tenant, House } from "@/lib/types"
import { DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { Modal } from "@/components/modal"
import { Save, X } from "lucide-react"
import { toast } from "sonner"

const ID_TYPE_OPTIONS = [
  {
    value: "CC",
    label: "Cédula de Ciudadanía (CC)",
  },
  {
    value: "TI",
    label: "Tarjeta de Identidad (TI)",
  },
  {
    value: "RC",
    label: "Registro Civil de Nacimiento (RC)",
  },
  {
    value: "CE",
    label: "Cédula de Extranjería (CE)",
  },
  {
    value: "PP",
    label: "Pasaporte (PP)",
  },
  {
    value: "PEP",
    label: "Permiso Especial de Permanencia (PEP)",
  },
  {
    value: "NIT",
    label: "NIT",
  },
]

export function TenantsPage() {
  const { t } = useI18n()
  const { data: tenants = [], mutate } = useSWR<Tenant[]>("tenants", api.getTenants)
  const { data: houses = [] } = useSWR<House[]>("houses", api.getHouses)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null)
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null)
  const [tenantPendingDelete, setTenantPendingDelete] = useState<Tenant | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    tenantTypeId: "",
    tenantIdNumber: "",
    houseId: "",
    parentName: "",
    parentId: "",
    parentAddress: "",
    parentPhone: "",
    guardianTypeId: "",
    guardianIdNumber: "",
  })

  const columns = [
    { key: "name", label: t("tenants.name") },
    { key: "email", label: t("tenants.email") },
    { key: "phone", label: t("tenants.phone") },
    { key: "houseName", label: t("tenants.house") },
  ]

  const openCreate = () => {
    setEditingTenant(null)
    setFormData({
      name: "",
      email: "",
      phone: "",
      tenantTypeId: "",
      tenantIdNumber: "",
      houseId: houses[0]?.id || "",
      parentName: "",
      parentId: "",
      parentAddress: "",
      parentPhone: "",
      guardianTypeId: "",
      guardianIdNumber: "",
    })
    setIsModalOpen(true)
  }

  const openEdit = (tenant: Tenant) => {
    setEditingTenant(tenant)
    setFormData({
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone,
      tenantTypeId: tenant.tenantTypeId,
      tenantIdNumber: tenant.tenantIdNumber,
      houseId: tenant.houseId,
      parentName: tenant.parentName,
      parentId: tenant.parentId,
      parentAddress: tenant.parentAddress,
      parentPhone: tenant.parentPhone,
      guardianTypeId: tenant.guardianTypeId,
      guardianIdNumber: tenant.guardianIdNumber,
    })
    setIsModalOpen(true)
  }

  const openDetail = (tenant: Tenant) => {
    setSelectedTenant(tenant)
    setIsDetailOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const house = houses.find((h) => h.id === formData.houseId)
      const payload = { ...formData, houseName: house?.name || "" }
      let successMessage = ""

      if (editingTenant) {
        await api.updateTenant(editingTenant.id, payload)
        successMessage = t("tenants.updatedSuccess")
      } else {
        const createdTenant = await api.createTenant(payload)
        successMessage = t("tenants.createdSuccess")
        if (createdTenant.auth?.firebaseUserCreated) {
          if (createdTenant.auth.passwordResetEmailSent) {
            successMessage = `${t("tenants.resetEmailSentPrefix")} ${createdTenant.email}.`
          } else {
            successMessage = t("tenants.resetEmailNotConfirmed")
          }
        }
      }
      await mutate()
      setIsModalOpen(false)
      toast.success(successMessage)
    } catch (err) {
      console.error("Save error:", err)
      const message = err instanceof Error && err.message ? err.message : t("tenants.saveError")
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (tenant: Tenant) => {
    setTenantPendingDelete(tenant)
  }

  const confirmDelete = async () => {
    if (!tenantPendingDelete || deleting) return

    setDeleting(true)

    try {
      await api.deleteTenant(tenantPendingDelete.id)
      await mutate()
      toast.success(t("tenants.deletedSuccess"))
      setTenantPendingDelete(null)
    } catch (err) {
      console.error("Delete error:", err)
      toast.error(t("tenants.deleteError"))
    } finally {
      setDeleting(false)
    }
  }

  const inputClass =
    "rounded-lg border border-input bg-card px-4 py-2.5 text-sm text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("tenants.title")}
        filterLabel={t("tenants.filter")}
        onFilter={() => {}}
        createLabel={t("tenants.create")}
        onCreate={openCreate}
      />

      <div className="rounded-xl border border-border bg-card">
        <DataTable
          columns={columns}
          data={tenants}
          onView={openDetail}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      </div>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTenant ? t("tenants.editTitle") : t("tenants.createTitle")}
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
              <label htmlFor="tenantName" className="text-sm font-medium text-card-foreground">
                {t("tenants.name")} <span className="text-destructive">*</span>
              </label>
              <input
                id="tenantName"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tenantEmail" className="text-sm font-medium text-card-foreground">
                {t("tenants.email")} <span className="text-destructive">*</span>
              </label>
              <input
                id="tenantEmail"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tenantPhone" className="text-sm font-medium text-card-foreground">
                {t("tenants.phone")} <span className="text-destructive">*</span>
              </label>
              <input
                id="tenantPhone"
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                required
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tenantHouse" className="text-sm font-medium text-card-foreground">
                {t("tenants.house")} <span className="text-destructive">*</span>
              </label>
              <select
                id="tenantHouse"
                value={formData.houseId}
                onChange={(e) => setFormData({ ...formData, houseId: e.target.value })}
                required
                className={inputClass}
              >
                <option value="">--</option>
                {houses.map((house) => (
                  <option key={house.id} value={house.id}>
                    {house.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="tenantTypeId" className="text-sm font-medium text-card-foreground">
                  {t("tenants.tenantTypeId")} <span className="text-destructive">*</span>
                </label>
                <select
                  id="tenantTypeId"
                  value={formData.tenantTypeId}
                  onChange={(e) => setFormData({ ...formData, tenantTypeId: e.target.value })}
                  required
                  className={inputClass}
                >
                  <option value="">--</option>
                  {ID_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="tenantIdNumber" className="text-sm font-medium text-card-foreground">
                  {t("tenants.tenantIdNumber")} <span className="text-destructive">*</span>
                </label>
                <input
                  id="tenantIdNumber"
                  type="text"
                  value={formData.tenantIdNumber}
                  onChange={(e) => setFormData({ ...formData, tenantIdNumber: e.target.value })}
                  required
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <hr className="border-border" />
          <h3 className="text-sm font-bold text-card-foreground">{t("tenants.guardianInfo")}</h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="parentName" className="text-sm font-medium text-card-foreground">
                {t("tenants.parentName")} <span className="text-destructive">*</span>
              </label>
              <input
                id="parentName"
                type="text"
                value={formData.parentName}
                onChange={(e) => setFormData({ ...formData, parentName: e.target.value })}
                required
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="parentId" className="text-sm font-medium text-card-foreground">
                {t("tenants.parentId")} <span className="text-destructive">*</span>
              </label>
              <input
                id="parentId"
                type="text"
                value={formData.parentId}
                onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                required
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="parentAddress" className="text-sm font-medium text-card-foreground">
                {t("tenants.parentAddress")} <span className="text-destructive">*</span>
              </label>
              <input
                id="parentAddress"
                type="text"
                value={formData.parentAddress}
                onChange={(e) => setFormData({ ...formData, parentAddress: e.target.value })}
                required
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="parentPhone" className="text-sm font-medium text-card-foreground">
                {t("tenants.parentPhone")} <span className="text-destructive">*</span>
              </label>
              <input
                id="parentPhone"
                type="text"
                value={formData.parentPhone}
                onChange={(e) => setFormData({ ...formData, parentPhone: e.target.value })}
                required
                className={inputClass}
              />
            </div>
            <div className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="guardianTypeId" className="text-sm font-medium text-card-foreground">
                  {t("tenants.guardianTypeId")} <span className="text-destructive">*</span>
                </label>
                <select
                  id="guardianTypeId"
                  value={formData.guardianTypeId}
                  onChange={(e) => setFormData({ ...formData, guardianTypeId: e.target.value })}
                  required
                  className={inputClass}
                >
                  <option value="">--</option>
                  {ID_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="guardianIdNumber" className="text-sm font-medium text-card-foreground">
                  {t("tenants.guardianIdNumber")} <span className="text-destructive">*</span>
                </label>
                <input
                  id="guardianIdNumber"
                  type="text"
                  value={formData.guardianIdNumber}
                  onChange={(e) => setFormData({ ...formData, guardianIdNumber: e.target.value })}
                  required
                  className={inputClass}
                />
              </div>
            </div>
          </div>

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

      {/* Detail Modal */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={selectedTenant?.name || ""}
        size="lg"
      >
        {selectedTenant && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoField label={t("tenants.name")} value={selectedTenant.name} />
            <InfoField label={t("tenants.email")} value={selectedTenant.email} />
            <InfoField label={t("tenants.phone")} value={selectedTenant.phone} />
            <InfoField label={t("tenants.tenantTypeId")} value={selectedTenant.tenantTypeId} />
            <InfoField label={t("tenants.tenantIdNumber")} value={selectedTenant.tenantIdNumber} />
            <InfoField label={t("tenants.house")} value={selectedTenant.houseName} />
            <div className="col-span-full border-t border-border pt-4">
              <h3 className="mb-3 text-sm font-bold text-card-foreground">{t("tenants.guardianInfo")}</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <InfoField label={t("tenants.parentName")} value={selectedTenant.parentName} />
                <InfoField label={t("tenants.parentId")} value={selectedTenant.parentId} />
                <InfoField label={t("tenants.parentAddress")} value={selectedTenant.parentAddress} />
                <InfoField label={t("tenants.parentPhone")} value={selectedTenant.parentPhone} />
                <InfoField label={t("tenants.guardianTypeId")} value={selectedTenant.guardianTypeId} />
                <InfoField label={t("tenants.guardianIdNumber")} value={selectedTenant.guardianIdNumber} />
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!tenantPendingDelete}
        onClose={() => setTenantPendingDelete(null)}
        title={t("general.confirm")}
        size="sm"
      >
        <div className="flex flex-col gap-5">
          <p className="text-sm text-card-foreground">{t("tenants.deleteConfirm")}</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setTenantPendingDelete(null)}
              disabled={deleting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-muted sm:w-auto"
            >
              {t("general.cancel")}
            </button>
            <button
              type="button"
              onClick={() => void confirmDelete()}
              disabled={deleting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50 sm:w-auto"
            >
              {deleting ? t("general.loading") : t("general.delete")}
            </button>
          </div>
        </div>
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
