// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  native: true,
  write: vi.fn(),
  remove: vi.fn(),
  share: vi.fn(),
  append: vi.fn(),
  rmdir: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => mocks.native } }));
vi.mock("@capacitor/filesystem", () => ({
  Filesystem: {
    writeFile: mocks.write,
    deleteFile: mocks.remove,
    appendFile: mocks.append,
    rmdir: mocks.rmdir,
  },
  Directory: { Cache: "CACHE" },
  Encoding: { UTF8: "utf8" },
}));
vi.mock("@capacitor/share", () => ({ Share: { share: mocks.share } }));
import { deliverExportFile, deliverExportBlob, clearExportCacheForUser } from "./deliverExportFile";
beforeEach(() => {
  mocks.native = true;
  localStorage.clear();
  mocks.write.mockReset().mockResolvedValue({ uri: "file:///cache/export.json" });
  mocks.remove.mockReset().mockResolvedValue(undefined);
  mocks.append.mockReset().mockResolvedValue(undefined);
  mocks.rmdir.mockReset().mockResolvedValue(undefined);
  mocks.share.mockReset().mockResolvedValue({ activityType: "com.apple.DocumentManager" });
});
describe("iPhone export handoff", () => {
  it("waits for a real file and native share, then removes the temporary personal data", async () => {
    await expect(deliverExportFile("my-data.json", '{"rows":[1,2]}')).resolves.toBe("delivered");
    expect(mocks.write).toHaveBeenCalledWith(
      expect.objectContaining({ directory: "CACHE", encoding: "utf8", data: '{"rows":[1,2]}' }),
    );
    expect(mocks.share).toHaveBeenCalledWith(
      expect.objectContaining({ files: ["file:///cache/export.json"] }),
    );
    expect(mocks.remove).toHaveBeenCalledWith(expect.objectContaining({ directory: "CACHE" }));
  });
  it("does not report success when writing fails or sharing is cancelled", async () => {
    mocks.write.mockRejectedValueOnce(new Error("Disk full"));
    await expect(deliverExportFile("data.json", "{}")).rejects.toThrow("Disk full");
    expect(mocks.share).not.toHaveBeenCalled();
    mocks.share.mockRejectedValueOnce(new Error("Share canceled"));
    await expect(deliverExportFile("data.json", "{}")).resolves.toBe("cancelled");
  });
  it("writes a binary video in bounded base64 chunks and shares the completed file", async () => {
    const bytes = new Uint8Array(2 * 1024 * 1024 + 5);
    bytes.fill(7);
    await expect(
      deliverExportBlob("test.mp4", new Blob([bytes], { type: "video/mp4" })),
    ).resolves.toBe("delivered");
    expect(mocks.write).toHaveBeenCalledTimes(1);
    expect(mocks.write.mock.calls[0][0].encoding).toBeUndefined();
    expect(mocks.append).toHaveBeenCalledTimes(1);
    expect(atob(mocks.append.mock.calls[0][0].data)).toHaveLength(5);
    expect(mocks.share).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledTimes(1);
  });
  it("removes interrupted export files only for the deleted account", async () => {
    await clearExportCacheForUser("owner-one");
    expect(mocks.rmdir).toHaveBeenCalledWith({
      path: "ballwise-exports/owner-one",
      directory: "CACHE",
      recursive: true,
    });
    mocks.rmdir.mockRejectedValueOnce({ code: "OS-PLUG-FILE-0008" });
    await expect(clearExportCacheForUser("owner-two")).resolves.toBeUndefined();
  });
  it("cancels a previous account's delayed file before presenting it to another account", async () => {
    localStorage.setItem("ballwise:offline-owner:active", "owner-one");
    mocks.write.mockImplementationOnce(async () => {
      localStorage.setItem("ballwise:offline-owner:active", "owner-two");
      return { uri: "file:///cache/export.json" };
    });
    await expect(
      deliverExportFile("data.json", "{}", "application/json", "owner-one"),
    ).resolves.toBe("cancelled");
    expect(mocks.share).not.toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalled();
  });
});
