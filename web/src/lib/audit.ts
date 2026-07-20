import { insertAuditLog } from "@/lib/db/queries";

export async function writeAuditLog(
  action: string,
  entity?: string,
  entityId?: string,
  payload?: Record<string, unknown>,
) {
  await insertAuditLog({
    action,
    entity,
    entity_id: entityId,
    payload,
  });
}
