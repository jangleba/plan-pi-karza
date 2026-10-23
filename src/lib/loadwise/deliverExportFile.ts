import { Capacitor } from "@capacitor/core";
function activeOwner(): string | undefined {
  try {
    return typeof window === "undefined"
      ? undefined
      : (window.localStorage.getItem("ballwise:offline-owner:active") ?? undefined);
  } catch {
    return undefined;
  }
}
function exportOwnerFolder(ownerId?: string) {
  const owner = ownerId ?? activeOwner();
  return `ballwise-exports/${owner?.replace(/[^a-zA-Z0-9_-]/g, "_") || "unassigned"}`;
}

/** Resolve only after handing the file to the system; never claim that a download was saved. */
export async function deliverExportFile(
  filename: string,
  text: string,
  mime = "application/json",
  ownerId?: string,
): Promise<"delivered" | "cancelled"> {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ownerAtStart = activeOwner();
  if (ownerId && ownerAtStart && ownerId !== ownerAtStart) return "cancelled";
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import("@capacitor/filesystem"),
      import("@capacitor/share"),
    ]);
    const path = `${exportOwnerFolder(ownerId)}/${crypto.randomUUID()}-${safeName}`;
    try {
      const file = await Filesystem.writeFile({
        path,
        directory: Directory.Cache,
        data: text,
        encoding: Encoding.UTF8,
        recursive: true,
      });
      if (ownerAtStart && activeOwner() !== ownerAtStart) return "cancelled";
      const result = await Share.share({
        title: "Moje dane BallWise",
        dialogTitle: "Zapisz kopię danych",
        files: [file.uri],
      });
      return result.activityType === "" ? "cancelled" : "delivered";
    } catch (error) {
      if (
        /cancel|anulow/i.test(
          error instanceof Error
            ? error.message
            : String((error as { message?: string })?.message ?? error),
        )
      )
        return "cancelled";
      throw error;
    } finally {
      // Share resolves after the native activity has consumed the file.
      await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => undefined);
    }
  }
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeName;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return "delivered";
}

function base64Chunk(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Nie można odczytać fragmentu pliku."));
    reader.onabort = () => reject(new Error("Odczyt pliku został przerwany."));
    reader.onload = () => {
      const url = String(reader.result);
      const comma = url.indexOf(",");
      if (comma < 0) reject(new Error("Nieprawidłowy fragment pliku."));
      else resolve(url.slice(comma + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/** Binary videos stay binary; only one 2 MiB chunk crosses the JS/native bridge at a time. */
export async function deliverExportBlob(
  filename: string,
  blob: Blob,
  ownerId?: string,
): Promise<"delivered" | "cancelled"> {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ownerAtStart = activeOwner();
  if (ownerId && ownerAtStart && ownerId !== ownerAtStart) return "cancelled";
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import("@capacitor/filesystem"),
      import("@capacitor/share"),
    ]);
    const path = `${exportOwnerFolder(ownerId)}/${crypto.randomUUID()}-${safeName}`;
    try {
      const chunkSize = 2 * 1024 * 1024;
      const first = await Filesystem.writeFile({
        path,
        directory: Directory.Cache,
        data: await base64Chunk(blob.slice(0, chunkSize)),
        recursive: true,
      });
      for (let offset = chunkSize; offset < blob.size; offset += chunkSize) {
        if (ownerAtStart && activeOwner() !== ownerAtStart) return "cancelled";
        await Filesystem.appendFile({
          path,
          directory: Directory.Cache,
          data: await base64Chunk(blob.slice(offset, offset + chunkSize)),
        });
      }
      if (ownerAtStart && activeOwner() !== ownerAtStart) return "cancelled";
      const result = await Share.share({
        title: "Plik BallWise",
        dialogTitle: "Zapisz kopię pliku",
        files: [first.uri],
      });
      return result.activityType === "" ? "cancelled" : "delivered";
    } catch (error) {
      if (
        /cancel|anulow/i.test(
          error instanceof Error
            ? error.message
            : String((error as { message?: string })?.message ?? error),
        )
      )
        return "cancelled";
      throw error;
    } finally {
      await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => undefined);
    }
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeName;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return "delivered";
}

/** Also remove temporary files left by an interrupted native share for this account only. */
export async function clearExportCacheForUser(userId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  try {
    await Filesystem.rmdir({
      path: exportOwnerFolder(userId),
      directory: Directory.Cache,
      recursive: true,
    });
  } catch (error) {
    if ((error as { code?: string })?.code !== "OS-PLUG-FILE-0008") throw error;
  }
}
