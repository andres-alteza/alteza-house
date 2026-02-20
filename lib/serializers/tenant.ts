import type { Tenant } from "@/lib/types"

export function serializeTenant(doc: any): Tenant {
  return {
    id: doc._id.toString(),
    name: doc.name ?? "",
    email: doc.email ?? "",
    phone: doc.phone ?? "",
    tenantTypeId: doc.tenantTypeId ?? "",
    tenantIdNumber: doc.tenantIdNumber ?? "",
    houseId: doc.houseId ?? "",
    houseName: doc.houseName ?? "",
    parentName: doc.parentName ?? "",
    parentId: doc.parentId ?? "",
    parentAddress: doc.parentAddress ?? "",
    parentPhone: doc.parentPhone ?? "",
    guardianTypeId: doc.guardianTypeId ?? "",
    guardianIdNumber: doc.guardianIdNumber ?? "",
  }
}

