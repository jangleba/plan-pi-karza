import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LocalNotifications } from "@capacitor/local-notifications";
import { useAuth } from "@/lib/loadwise/auth";
import { useLoadwise } from "@/lib/loadwise/store";
import { resolveEffectivePlan } from "@/lib/loadwise/effectivePlan";
import {
  localDate,
  manualFuelContext,
  planFuelContexts,
  readFuelData,
} from "@/lib/fuel/experience";
import {
  isFuelNotificationId,
  planFuelReminders,
  readReminderPreferences,
  snoozedReminder,
  type FuelReminder,
} from "@/lib/fuel/reminderPlan";
import {
  activateFuelNotificationOwner,
  cancelFuelNotifications,
  nativeFuelRemindersAvailable,
  syncFuelNotifications,
} from "@/lib/fuel/nativeReminders";

/** Mounted above tabs so reminders and notification actions work outside Fuel. */
export function FuelReminderBridge() {
  const { user, loading } = useAuth();
  const { state, hydrated } = useLoadwise();
  const navigate = useNavigate();
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const userId = user?.id;
  const plan = useMemo(
    () =>
      resolveEffectivePlan(state.plan, state.modifications, {
        profile: state.profile,
        readiness: state.readiness,
        completions: state.completions,
      }),
    [state.plan, state.modifications, state.profile, state.readiness, state.completions],
  );
  useEffect(() => {
    const refresh = () => {
      setNow(Date.now());
      setRevision((v) => v + 1);
    };
    const clear = (event: Event) => {
      const owner = (event as CustomEvent<{ userId: string }>).detail?.userId;
      if (owner) void cancelFuelNotifications(owner).catch(() => undefined);
      refresh();
    };
    window.addEventListener("ballwise:fuel-changed", refresh);
    window.addEventListener("ballwise:clear-user-data", clear);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 60_000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("ballwise:fuel-changed", refresh);
      window.removeEventListener("ballwise:clear-user-data", clear);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  useEffect(() => {
    if (loading) return;
    if (!userId) {
      void cancelFuelNotifications().catch(() => undefined);
      return;
    }
    activateFuelNotificationOwner(userId);
  }, [loading, userId]);
  useEffect(() => {
    if (loading || !userId || !hydrated || !nativeFuelRemindersAvailable()) return;
    let storage: Storage;
    try {
      storage = window.localStorage;
    } catch {
      void cancelFuelNotifications().catch(() => undefined);
      return;
    }
    let data;
    try {
      data = readFuelData(storage, userId, now);
    } catch {
      void cancelFuelNotifications().catch(() => undefined);
      return;
    }
    const prefs = readReminderPreferences(storage, userId);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const contexts = [
      ...planFuelContexts(plan, localDate(now), state.completions),
      ...planFuelContexts(plan, localDate(tomorrow.getTime()), state.completions),
    ];
    if (data.selection?.contextKey === null && data.selection) {
      const s = data.selection;
      contexts.push(
        manualFuelContext(localDate(now), s.manualKind, s.manualDurationMin, s.manualLoad),
      );
    }
    void syncFuelNotifications(
      planFuelReminders({ userId, contexts, data, preferences: prefs, now }),
      userId,
    ).catch(() => {
      window.dispatchEvent(new CustomEvent("ballwise:fuel-reminder-error"));
    });
  }, [loading, userId, hydrated, plan, state.completions, now, revision]);
  useEffect(() => {
    if (!userId || !nativeFuelRemindersAvailable()) return;
    let active = true;
    const handle = LocalNotifications.addListener(
      "localNotificationActionPerformed",
      async ({ actionId, notification }) => {
        try {
          if (!active || !isFuelNotificationId(notification.id)) return;
          const reminder = notification.extra as FuelReminder | undefined;
          if (!reminder || reminder.userId !== userId) return;
          if (actionId === "snooze") {
            const now = Date.now();
            const prefs = readReminderPreferences(window.localStorage, userId);
            const next = prefs.enabled ? snoozedReminder(reminder, now, prefs) : null;
            if (next) {
              const pending = await LocalNotifications.getPending();
              const otherPlans = pending.notifications
                .filter(
                  (n) =>
                    isFuelNotificationId(n.id) &&
                    n.id !== reminder.id &&
                    n.extra?.userId === userId,
                )
                .map((n) => n.extra as FuelReminder);
              await syncFuelNotifications([...otherPlans, next], userId);
            }
          } else void navigate({ to: "/fuel" });
        } catch {
          window.dispatchEvent(new CustomEvent("ballwise:fuel-reminder-error"));
        }
      },
    );
    return () => {
      active = false;
      void handle.then((h) => h.remove()).catch(() => undefined);
    };
  }, [userId, navigate]);
  return null;
}
