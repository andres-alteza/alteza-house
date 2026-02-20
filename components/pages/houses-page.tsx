"use client"

import { useState } from "react"
import useSWR from "swr"
import { useI18n } from "@/lib/i18n-context"
import { api } from "@/lib/api-client"
import type { House } from "@/lib/types"
import { DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { Modal } from "@/components/modal"
import { Save, X } from "lucide-react"
import { toast } from "sonner"

export function HousesPage() {
  const { t } = useI18n()
  const { data: houses = [], mutate } = useSWR<House[]>("houses", api.getHouses)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingHouse, setEditingHouse] = useState<House | null>(null)
  const [housePendingDelete, setHousePendingDelete] = useState<House | null>(null)
  const [formName, setFormName] = useState("")
  const [formAddress, setFormAddress] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const columns = [
    { key: "name", label: t("houses.name") },
    { key: "address", label: t("houses.address") },
  ]

  const openCreate = () => {
    setEditingHouse(null)
    setFormName("")
    setFormAddress("")
    setIsModalOpen(true)
  }

  const openEdit = (house: House) => {
    setEditingHouse(house)
    setFormName(house.name)
    setFormAddress(house.address)
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const successMessage = editingHouse ? t("houses.updatedSuccess") : t("houses.createdSuccess")
      if (editingHouse) {
        await api.updateHouse(editingHouse.id, { name: formName, address: formAddress })
      } else {
        await api.createHouse({ name: formName, address: formAddress })
      }
      await mutate()
      setIsModalOpen(false)
      toast.success(successMessage)
    } catch (err) {
      console.error("Save error:", err)
      toast.error(t("houses.saveError"))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (house: House) => {
    setHousePendingDelete(house)
  }

  const confirmDelete = async () => {
    if (!housePendingDelete || deleting) return

    setDeleting(true)

    try {
      await api.deleteHouse(housePendingDelete.id)
      await mutate()
      toast.success(t("houses.deletedSuccess"))
      setHousePendingDelete(null)
    } catch (err) {
      console.error("Delete error:", err)
      toast.error(t("houses.deleteError"))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("houses.title")}
        filterLabel={t("houses.filter")}
        onFilter={() => {}}
        createLabel={t("houses.create")}
        onCreate={openCreate}
      />

      <div className="rounded-xl border border-border bg-card">
        <DataTable
          columns={columns}
          data={houses}
          onEdit={(house) => openEdit(house)}
          onDelete={handleDelete}
        />
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingHouse ? t("houses.editTitle") : t("houses.createTitle")}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSave()
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="houseName" className="text-sm font-medium text-card-foreground">
              {t("houses.name")} <span className="text-destructive">*</span>
            </label>
            <input
              id="houseName"
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
              className="rounded-lg border border-input bg-card px-4 py-2.5 text-sm text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="houseAddress" className="text-sm font-medium text-card-foreground">
              {t("houses.address")} <span className="text-destructive">*</span>
            </label>
            <input
              id="houseAddress"
              type="text"
              value={formAddress}
              onChange={(e) => setFormAddress(e.target.value)}
              required
              className="rounded-lg border border-input bg-card px-4 py-2.5 text-sm text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
            />
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

      <Modal
        isOpen={!!housePendingDelete}
        onClose={() => setHousePendingDelete(null)}
        title={t("general.confirm")}
        size="sm"
      >
        <div className="flex flex-col gap-5">
          <p className="text-sm text-card-foreground">{t("houses.deleteConfirm")}</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setHousePendingDelete(null)}
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
