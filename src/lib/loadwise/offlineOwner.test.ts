// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { forgetOfflineOwner, loadOfflineOwner, rememberOfflineOwner } from "./offlineOwner";
function storage() {
  const rows = new Map<string, string>();
  return {
    getItem: (key: string) => rows.get(key) ?? null,
    setItem: (key: string, value: string) => {
      rows.set(key, value);
    },
    removeItem: (key: string) => {
      rows.delete(key);
    },
  } as Storage;
}
const id = "11111111-1111-4111-8111-111111111111";
describe("offline local identity", () => {
  it("keeps auth events and logout usable when storage access itself is denied", () => {
    const blocked = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    try {
      expect(() => rememberOfflineOwner({ id })).not.toThrow();
      expect(() => forgetOfflineOwner(id)).not.toThrow();
      expect(loadOfflineOwner()).toBeNull();
    } finally {
      blocked.mockRestore();
    }
  });
  it("allows only a bounded previous owner and never creates a server session", () => {
    const store = storage();
    rememberOfflineOwner({ id }, store, 1000);
    expect(loadOfflineOwner(store, 2000)?.id).toBe(id);
    expect(loadOfflineOwner(store, 2000)?.aud).toBe("offline-local-owner");
    expect(loadOfflineOwner(store, 1000 + 8 * 86400_000)).toBeNull();
    forgetOfflineOwner(id, store);
    expect(loadOfflineOwner(store, 2000)).toBeNull();
  });
  it("rejects future timestamps and invalid local identity", () => {
    const store = storage();
    rememberOfflineOwner({ id }, store, 3000);
    expect(loadOfflineOwner(store, 2000)).toBeNull();
    store.setItem("ballwise:offline-owner:active", "not-a-user");
    expect(loadOfflineOwner(store, 4000)).toBeNull();
  });
});
