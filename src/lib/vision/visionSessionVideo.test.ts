import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearVisionSessionVideo,
  loadVisionSessionVideo,
  saveVisionSessionVideo,
} from "./visionSessionVideo";

describe("visionSessionVideo fallback", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps analysis usable when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const file = new File(["video"], "cmj.mp4", { type: "video/mp4" });

    await expect(saveVisionSessionVideo("cmj", file)).resolves.toBe(false);
    await expect(loadVisionSessionVideo("cmj")).resolves.toBeNull();
    await expect(clearVisionSessionVideo("cmj")).resolves.toBeUndefined();
  });

  it("rejects an empty local file instead of persisting a fake source", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const empty = new File([], "empty.mov", { type: "video/quicktime" });

    await expect(saveVisionSessionVideo("cmj", empty)).resolves.toBe(false);
  });
});
