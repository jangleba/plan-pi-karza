/** IQ progress on the account: an opt-in copy after every action and a restore on another device.
 * Uses the existing per-device module backups (module "iq"); IQ data holds no user text. */
import {
  fetchModuleBackup,
  listModuleBackups,
  moduleBackupDeviceId,
  saveModuleBackup,
} from "../module-backup/client";
import {
  applyModuleRestore,
  createModuleSnapshot,
  previewModuleRestore,
  rememberModuleSnapshot,
  validateModuleSnapshot,
} from "../module-backup/model";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const cloudBackupKey = (owner: string) => `ballwise:iq:cloud-backup:v1:${owner}`;

export function cloudBackupEnabled(owner: string | undefined, storage: Store = localStorage) {
  if (!owner) return false;
  try {
    return storage.getItem(cloudBackupKey(owner)) === "on";
  } catch {
    return false;
  }
}
export function setCloudBackup(owner: string, on: boolean, storage: Store = localStorage) {
  if (on) storage.setItem(cloudBackupKey(owner), "on");
  else storage.removeItem(cloudBackupKey(owner));
}

/** Saves this device's IQ copy on the account. */
export async function backupIqNow(owner: string, storage: Store = localStorage) {
  const snapshot = createModuleSnapshot("iq", owner, storage, false);
  const device = moduleBackupDeviceId(owner, storage);
  const previous = (await listModuleBackups(owner, "iq")).find((row) => row.device_id === device);
  const row = await saveModuleBackup(owner, device, previous?.revision ?? 0, snapshot);
  rememberModuleSnapshot(owner, snapshot, storage);
  return row;
}

/** Merges every IQ copy on the account into this device, newest first. Local data is kept. */
export async function restoreIqFromAccount(owner: string, storage: Store = localStorage) {
  const rows = (await listModuleBackups(owner, "iq")).sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  );
  let added = 0,
    copies = 0;
  for (const summary of rows) {
    const row = await fetchModuleBackup(owner, "iq", summary.device_id);
    const snapshot = validateModuleSnapshot(row.payload, "iq", owner);
    const preview = previewModuleRestore(snapshot, owner, storage);
    applyModuleRestore(preview, owner, storage);
    added += preview.added;
    copies++;
  }
  return { copies, added };
}
