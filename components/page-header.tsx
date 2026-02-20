"use client"

import React from "react"

import { Filter, Plus } from "lucide-react"

interface PageHeaderProps {
  title: string
  filterLabel?: string
  onFilter?: () => void
  createLabel?: string
  onCreate?: () => void
  createDisabled?: boolean
  children?: React.ReactNode
}

export function PageHeader({
  title,
  filterLabel,
  onFilter,
  createLabel,
  onCreate,
  createDisabled = false,
  children,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-xl font-bold text-foreground">{title}</h1>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        {onFilter && filterLabel && (
          <button
            type="button"
            onClick={onFilter}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:w-auto"
          >
            <Filter className="h-4 w-4" />
            {filterLabel}
          </button>
        )}
        {onCreate && createLabel && (
          <button
            type="button"
            onClick={onCreate}
            disabled={createDisabled}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            {createLabel}
          </button>
        )}
      </div>
    </div>
  )
}
