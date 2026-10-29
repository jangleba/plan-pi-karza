import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FuelReminder } from "./reminderPlan";

const mock = vi.hoisted(() => ({
  native: true,
  granted: true,
  pending: [] as { id: number; title?: string; body?: string; extra?: Record<string, unknown> }[],
  cancel: vi.fn(),
  schedule: vi.fn(),
  request: vi.fn(),
  removeDelivered: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => mock.native, isPluginAvailable: () => mock.native },
}));
vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    getPending: async () => ({ notifications: mock.pending }),
    getDeliveredNotifications: async () => ({ notifications: [{ id: 1610000001 }, { id: 12 }] }),
    cancel: mock.cancel,
    schedule: mock.schedule,
    checkPermissions: async () => ({ display: mock.granted ? "granted" : "denied" }),
    requestPermissions: mock.request,
    removeDeliveredNotifications: mock.removeDelivered,
    registerActionTypes: async () => undefined,
  },
}));
import {
  activateFuelNotificationOwner,
  cancelFuelNotifications,
  enableFuelReminderPermission,
  syncFuelNotifications,
} from "./nativeReminders";

const plan = (): FuelReminder => ({
  id: 1610000001,
  key: "a:training:prepare:1",
  userId: "a",
  contextKey: "training",
  kind: "prepare",
  at: Date.now() + 3_600_000,
  expiresAt: Date.now() + 7_200_000,
  title: "Fuel",
  body: "Zestaw",
});
beforeEach(() => {
  vi.clearAllMocks();
  mock.native = true;
  mock.granted = true;
  mock.pending = [];
  activateFuelNotificationOwner("a");
});
describe("native Fuel notification lifecycle", () => {
  it("does not request permission or pretend to schedule notifications on the web", async () => {
    mock.native = false;
    expect(await enableFuelReminderPermission()).toBe(false);
    await syncFuelNotifications([plan()], "a");
    expect(mock.schedule).not.toHaveBeenCalled();
    expect(mock.request).not.toHaveBeenCalled();
  });
  it("replaces obsolete Fuel deadlines and preserves unrelated notifications", async () => {
    mock.pending = [{ id: 1610000001, extra: { userId: "a", key: "old-time" } }, { id: 12 }];
    await syncFuelNotifications([plan()], "a");
    expect(mock.cancel).toHaveBeenCalledWith({ notifications: [mock.pending[0]] });
    expect(mock.schedule).toHaveBeenCalledOnce();
    const notification = mock.schedule.mock.calls[0][0].notifications[0];
    expect(notification.schedule.at).toBeInstanceOf(Date);
    expect(notification.extra.userId).toBe("a");
  });
  it("keeps the snoozed alarm while the original deadline passes", async () => {
    const p = plan();
    p.at = Date.now() - 1000;
    mock.pending = [{ id: p.id, extra: { userId: "a", key: `${p.key}:snooze:123` } }];
    await syncFuelNotifications([p], "a");
    expect(mock.cancel).not.toHaveBeenCalled();
    expect(mock.schedule).not.toHaveBeenCalled();
    await syncFuelNotifications([], "a");
    expect(mock.cancel).toHaveBeenCalledWith({ notifications: mock.pending });
  });
  it.each(["time", "meal"])(
    "updates a pending reminder when its %s changes without changing the context key",
    async (change) => {
      const p = plan();
      mock.pending = [{ id: p.id, title: p.title, body: p.body, extra: { ...p } }];
      const next =
        change === "time"
          ? { ...p, at: p.at + 15 * 60_000 }
          : { ...p, body: "Nowy wybrany posiłek" };
      await syncFuelNotifications([next], "a");
      expect(mock.cancel).toHaveBeenCalledWith({ notifications: mock.pending });
      expect(mock.schedule).toHaveBeenCalledOnce();
      const notification = mock.schedule.mock.calls[0][0].notifications[0];
      expect(notification.schedule.at.getTime()).toBe(next.at);
      expect(notification.body).toBe(next.body);
    },
  );
  it("leaves an unchanged pending reminder in place", async () => {
    const p = plan();
    mock.pending = [{ id: p.id, title: p.title, body: p.body, extra: { ...p } }];
    await syncFuelNotifications([p], "a");
    expect(mock.cancel).not.toHaveBeenCalled();
    expect(mock.schedule).not.toHaveBeenCalled();
  });
  it("cancels pending and delivered Fuel alarms on logout and blocks a late reschedule", async () => {
    mock.pending = [{ id: 1610000001 }, { id: 12 }];
    const pendingSync = syncFuelNotifications([plan()], "a");
    await cancelFuelNotifications("a");
    await pendingSync;
    await syncFuelNotifications([plan()], "a");
    expect(mock.schedule).not.toHaveBeenCalled();
    expect(mock.cancel).toHaveBeenCalledWith({ notifications: [{ id: 1610000001 }] });
    expect(mock.removeDelivered).toHaveBeenCalledWith({ notifications: [{ id: 1610000001 }] });
    activateFuelNotificationOwner("a");
    mock.pending = [];
    await syncFuelNotifications([plan()], "a");
    expect(mock.schedule).toHaveBeenCalledOnce();
  });
  it("does not automatically ask for permission during background synchronization", async () => {
    mock.granted = false;
    await syncFuelNotifications([plan()], "a");
    expect(mock.schedule).not.toHaveBeenCalled();
    expect(mock.request).not.toHaveBeenCalled();
  });
});
