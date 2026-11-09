// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { belongsToLocalUser, clearLocalUserData } from "@/lib/loadwise/localPrivacy";
import type { ModuleBackupRow } from "../module-backup/client";
import { fieldTaskKey } from "./fieldTask";
import { masteryKey } from "./mastery";

const remote = new Map<string, ModuleBackupRow>();
vi.mock("../module-backup/client", async (original) => {
  const actual = await original<typeof import("../module-backup/client")>();
  return {
    ...actual,
    listModuleBackups: vi.fn(async () => [...remote.values()].map(actual.summarizeBackup)),
    fetchModuleBackup: vi.fn(async (_o: string, _m: string, device: string) => remote.get(device)!),
    saveModuleBackup: vi.fn(
      async (owner: string, device: string, expected: number, payload: unknown) => {
        const row = {
          user_id: owner,
          module: "iq",
          device_id: device,
          revision: expected + 1,
          operation_id: "op",
          updated_at: new Date().toISOString(),
          payload,
        } as ModuleBackupRow;
        remote.set(device, row);
        return row;
      },
    ),
  };
});
const { backupIqNow, cloudBackupEnabled, restoreIqFromAccount, setCloudBackup, cloudBackupKey } =
  await import("./iqCloud");

const owner = "11111111-2222-4333-8444-555555555555";
beforeEach(() => {
  localStorage.clear();
  remote.clear();
});

describe("IQ progress on the account", () => {
  it("is off until the player turns it on", () => {
    expect(cloudBackupEnabled(owner)).toBe(false);
    setCloudBackup(owner, true);
    expect(cloudBackupEnabled(owner)).toBe(true);
    setCloudBackup(owner, false);
    expect(cloudBackupEnabled(owner)).toBe(false);
    expect(cloudBackupEnabled(undefined)).toBe(false);
  });

  it("copies progress from one device and restores it on another", async () => {
    localStorage.setItem(masteryKey(owner), JSON.stringify({ press: ["good", "good"] }));
    localStorage.setItem(
      fieldTaskKey(owner),
      JSON.stringify({
        id: "iqs-ten-press:0",
        text: "Doskakuj po łuku.",
        topicId: "iqs-ten-press",
        createdAt: "2026-11-09T10:00:00.000Z",
      }),
    );
    const saved = await backupIqNow(owner);
    expect(saved.revision).toBe(1);
    expect((await backupIqNow(owner)).revision).toBe(2);

    // A new phone: nothing local, a different device id.
    localStorage.clear();
    const result = await restoreIqFromAccount(owner);
    expect(result.copies).toBe(1);
    expect(JSON.parse(localStorage.getItem(masteryKey(owner))!)).toEqual({
      press: ["good", "good"],
    });
    expect(JSON.parse(localStorage.getItem(fieldTaskKey(owner))!).topicId).toBe("iqs-ten-press");
  });

  it("an empty account restores nothing and changes nothing", async () => {
    localStorage.setItem(masteryKey(owner), JSON.stringify({ cover: ["error"] }));
    expect(await restoreIqFromAccount(owner)).toEqual({ copies: 0, added: 0 });
    expect(JSON.parse(localStorage.getItem(masteryKey(owner))!)).toEqual({ cover: ["error"] });
  });

  it("progress, the pitch task and the setting are removed with the account's local data", () => {
    const keys = [masteryKey(owner), fieldTaskKey(owner), cloudBackupKey(owner)];
    for (const key of keys) {
      localStorage.setItem(key, "{}");
      expect(belongsToLocalUser(key, owner)).toBe(true);
    }
    clearLocalUserData(owner, localStorage);
    for (const key of keys) expect(localStorage.getItem(key)).toBeNull();
  });
});
