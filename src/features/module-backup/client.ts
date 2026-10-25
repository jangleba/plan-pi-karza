import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  validateModuleSnapshot,
  type BackupModule,
  type ModuleSnapshot,
  deviceStorageKey,
} from "./model";

export type ModuleBackupRow = Database["public"]["Tables"]["module_backups"]["Row"];
export type ModuleBackupSummary = Omit<ModuleBackupRow, "payload">;
export const summarizeBackup = (row: ModuleBackupRow): ModuleBackupSummary => ({
  user_id: row.user_id,
  module: row.module,
  device_id: row.device_id,
  revision: row.revision,
  operation_id: row.operation_id,
  updated_at: row.updated_at,
});
export function moduleBackupDeviceId(
  owner: string,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
): string {
  const key = deviceStorageKey(owner);
  const previous = storage.getItem(key);
  if (previous) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(previous)
    )
      throw new Error("Identyfikator kopii urządzenia jest uszkodzony. Zachowano zapis.");
    return previous;
  }
  const value = crypto.randomUUID();
  storage.setItem(key, value);
  return value;
}
export async function listModuleBackups(
  owner: string,
  module: BackupModule,
): Promise<ModuleBackupSummary[]> {
  const rows: ModuleBackupSummary[] = [];
  for (let from = 0; from < 1000; from += 100) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const result = await supabase
        .from("module_backups")
        .select("user_id,module,device_id,revision,operation_id,updated_at")
        .eq("user_id", owner)
        .eq("module", module)
        .order("device_id", { ascending: true })
        .range(from, from + 99)
        .abortSignal(controller.signal);
      if (result.error) throw result.error;
      rows.push(...(result.data ?? []));
      if ((result.data?.length ?? 0) < 100) return rows;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Masz bardzo dużo kopii urządzeń. Pobierz pełny eksport konta.");
}
export async function fetchModuleBackup(
  owner: string,
  module: BackupModule,
  deviceId: string,
): Promise<ModuleBackupRow> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const result = await supabase
      .from("module_backups")
      .select("*")
      .eq("user_id", owner)
      .eq("module", module)
      .eq("device_id", deviceId)
      .abortSignal(controller.signal)
      .maybeSingle();
    if (result.error) throw result.error;
    if (
      !result.data ||
      result.data.user_id !== owner ||
      result.data.module !== module ||
      result.data.device_id !== deviceId
    )
      throw new Error("Ta kopia jest już niedostępna. Odśwież listę.");
    return result.data;
  } finally {
    clearTimeout(timer);
  }
}
export async function saveModuleBackup(
  owner: string,
  deviceId: string,
  expectedVersion: number,
  snapshot: ModuleSnapshot,
): Promise<ModuleBackupRow> {
  const clean = validateModuleSnapshot(snapshot, snapshot.module, owner);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const result = await supabase
      .rpc("save_module_backup", {
        p_module: snapshot.module,
        p_device_id: deviceId,
        p_expected_version: expectedVersion,
        p_operation_id: crypto.randomUUID(),
        p_payload: clean as unknown as Json,
      })
      .abortSignal(controller.signal);
    if (result.error) throw result.error;
    const row = result.data as unknown as ModuleBackupRow;
    if (
      !row ||
      row.user_id !== owner ||
      row.module !== snapshot.module ||
      row.device_id !== deviceId ||
      !Number.isSafeInteger(row.revision) ||
      row.revision <= expectedVersion
    )
      throw new Error("Serwer nie potwierdził poprawnie kopii. Odśwież listę przed ponowieniem.");
    return row;
  } finally {
    clearTimeout(timer);
  }
}
