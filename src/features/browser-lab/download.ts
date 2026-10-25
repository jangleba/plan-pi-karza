import { deliverExportBlob, deliverExportFile } from "@/lib/loadwise/deliverExportFile";

/** Resolution means the browser/system accepted the handoff; cancellation never acknowledges a backup. */
export function downloadText(
  name: string,
  text: string,
  type = "application/json",
  ownerId?: string,
) {
  return deliverExportFile(name, text, type, ownerId);
}
export function downloadBlob(name: string, blob: Blob, ownerId?: string) {
  return deliverExportBlob(name, blob, ownerId);
}
