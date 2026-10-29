// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
const queue = vi.hoisted(() => ({ purge: vi.fn().mockResolvedValue(true) }));
vi.mock("./offlineTrainingQueue", () => ({
  purgeTrainingQueue: queue.purge,
  redactTrainingQueueHealthData: vi.fn(),
}));
import { clearLocalSessionData, clearLocalUserData, exportLocalUserData } from "./localPrivacy";
afterEach(() => vi.restoreAllMocks());
describe("privacy cleanup with unavailable browser storage", () => {
  it("allows logout and still invalidates account data when Safari blocks the storage getter", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    const cleared = vi.fn();
    window.addEventListener("ballwise:clear-user-data", cleared);
    try {
      expect(() => clearLocalSessionData("owner")).not.toThrow();
      expect(() => clearLocalUserData("owner")).not.toThrow();
      expect(queue.purge).toHaveBeenCalledWith("owner");
      expect(cleared).toHaveBeenCalledOnce();
      expect(cleared.mock.calls[0][0].detail).toEqual({ userId: "owner" });
    } finally {
      window.removeEventListener("ballwise:clear-user-data", cleared);
    }
  });
  it("does not label an unreadable device store as an empty successful export", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(() => exportLocalUserData("owner")).toThrow("Blocked");
  });
});
