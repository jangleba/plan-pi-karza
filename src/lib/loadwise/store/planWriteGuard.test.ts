import { beforeEach, describe, expect, it, vi } from "vitest";
import { guardedPlanWrite, isPlanWriteConflict, resetPlanWriteGuard } from "./planWriteGuard";

const conflict = () =>
  new Error(
    "[persist_training_plan_v2] Executed slots must remain in the plan snapshot | code: 40001",
  );

beforeEach(() => resetPlanWriteGuard());

describe("background plan write guard", () => {
  it("sends a write rejected by the server only once for the same stored plan", async () => {
    const write = vi.fn().mockRejectedValue(conflict());
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (let focus = 0; focus < 5; focus++)
      expect(await guardedPlanWrite("user|rebuild|plan-1", write)).toBeNull();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("tries again once another device has saved a newer plan", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await guardedPlanWrite("user|rebuild|plan-1", () => Promise.reject(conflict()));
    expect(await guardedPlanWrite("user|rebuild|plan-2", async () => "saved")).toBe("saved");
  });

  it("does not hide other failures such as a lost connection", async () => {
    await expect(
      guardedPlanWrite("user|rebuild|plan-1", () => Promise.reject(new Error("Failed to fetch"))),
    ).rejects.toThrow("Failed to fetch");
    expect(await guardedPlanWrite("user|rebuild|plan-1", async () => "saved")).toBe("saved");
  });

  it("recognizes only serialization conflicts", () => {
    expect(isPlanWriteConflict(conflict())).toBe(true);
    expect(isPlanWriteConflict(new Error("invalid plan payload | code: 22023"))).toBe(false);
    expect(isPlanWriteConflict(new Error("code: 400010"))).toBe(false);
  });
});
