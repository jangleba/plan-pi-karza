import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { isFuelNotificationId, type FuelReminder } from "./reminderPlan";

let revision = 0;
let queue: Promise<unknown> = Promise.resolve();
const blockedOwners = new Set<string>();
export const nativeFuelRemindersAvailable = () =>
  Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("LocalNotifications");
export function activateFuelNotificationOwner(userId: string) {
  blockedOwners.delete(userId);
}

export async function enableFuelReminderPermission(): Promise<boolean> {
  if (!nativeFuelRemindersAvailable()) return false;
  let status = await LocalNotifications.checkPermissions();
  if (status.display !== "granted") status = await LocalNotifications.requestPermissions();
  return status.display === "granted";
}

export async function cancelFuelNotifications(userId?: string): Promise<void> {
  revision += 1;
  if (userId) blockedOwners.add(userId);
  const work = async () => {
    if (!nativeFuelRemindersAvailable()) return;
    const pending = await LocalNotifications.getPending();
    const notifications = pending.notifications.filter((n) => isFuelNotificationId(n.id));
    if (notifications.length) await LocalNotifications.cancel({ notifications });
    const delivered = await LocalNotifications.getDeliveredNotifications();
    const own = delivered.notifications.filter((n) => isFuelNotificationId(n.id));
    if (own.length) await LocalNotifications.removeDeliveredNotifications({ notifications: own });
  };
  const next = queue.catch(() => undefined).then(work);
  queue = next;
  await next;
}

export async function syncFuelNotifications(plans: FuelReminder[], userId: string): Promise<void> {
  const ticket = ++revision;
  const work = async () => {
    if (!nativeFuelRemindersAvailable() || ticket !== revision || blockedOwners.has(userId)) return;
    const pending = await LocalNotifications.getPending();
    if (ticket !== revision || blockedOwners.has(userId)) return;
    const own = pending.notifications.filter((n) => isFuelNotificationId(n.id));
    const matches = (n: (typeof own)[number], p: FuelReminder) =>
      p.id === n.id &&
      n.extra?.userId === userId &&
      (p.key === n.extra?.key || String(n.extra?.key).startsWith(`${p.key}:snooze:`));
    const obsolete = own.filter((n) => !plans.some((p) => matches(n, p)));
    if (obsolete.length) await LocalNotifications.cancel({ notifications: obsolete });
    if (ticket !== revision || blockedOwners.has(userId)) return;
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== "granted" || ticket !== revision) return;
    const missing = plans.filter(
      (p) => p.at > Date.now() + 5000 && !own.some((n) => matches(n, p)),
    );
    if (!missing.length) return;
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: "BALLWISE_FUEL",
          actions: [
            { id: "open", title: "Otwórz Fuel", foreground: true },
            { id: "snooze", title: "Za 15 min", foreground: true },
          ],
        },
      ],
    });
    if (ticket !== revision || blockedOwners.has(userId)) return;
    await LocalNotifications.schedule({
      notifications: missing.map((p) => ({
        id: p.id,
        title: p.title,
        body: p.body,
        schedule: { at: new Date(p.at), allowWhileIdle: false },
        actionTypeId: "BALLWISE_FUEL",
        extra: { ...p, source: "ballwise-fuel" },
      })),
    });
  };
  const next = queue.catch(() => undefined).then(work);
  queue = next;
  await next;
}
