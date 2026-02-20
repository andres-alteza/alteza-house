import type { House } from "@/lib/types"

export function serializeHouse(doc: any): House {
  return {
    id: doc._id.toString(),
    name: doc.name ?? "",
    address: doc.address ?? "",
  }
}

