// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { buildUserDataExport, type ExportPageLoader } from "./dataExport";
import { clearLocalUserData } from "./localPrivacy";

describe("complete personal-data export", () => {
  it("pages beyond the API limit, includes owned module data and preserves unreadable local files", async () => {
    const userId = crypto.randomUUID();
    localStorage.setItem(`ballwise.browser-lab.v1:${userId}`, "{broken");
    localStorage.setItem(`ballwise:iq:journeys:v1:${userId}`, JSON.stringify({ attempts: [1] }));
    localStorage.setItem(`ballwise:fuel:v3:other-user`, "private");
    const pages: number[] = [];
    const load: ExportPageLoader = async (source, _user, from, to) => {
      if (source === "lab_test_results") return { data: null, error: { code: "42P01" } };
      if (source !== "exercise_set_logs") return { data: [], error: null };
      pages.push(from);
      return {
        data: Array.from({ length: Math.max(0, Math.min(to + 1, 1503) - from) }, (_, index) => ({
          id: from + index,
        })),
        error: null,
      };
    };
    const bundle = await buildUserDataExport({ id: userId }, load);
    expect(bundle.remote.exercise_set_logs).toHaveLength(1503);
    expect(pages).toEqual([0, 500, 1000, 1500]);
    expect(bundle.local[`ballwise.browser-lab.v1:${userId}`]).toEqual({
      raw: "{broken",
      readable: false,
      value: null,
    });
    expect(bundle.local[`ballwise:fuel:v3:other-user`]).toBeUndefined();
    expect(bundle.unavailable_sources).toHaveLength(1);
    clearLocalUserData(userId);
  });
  it("never labels a failed required table as a complete export", async () => {
    await expect(
      buildUserDataExport({ id: "a" }, async () => ({ data: null, error: { code: "42501" } })),
    ).rejects.toThrow("profiles");
  });
});
