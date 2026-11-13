import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { crossedSteps, stageLabel, repLabel, stepBoundaries } from "./guideTimeline";
import type { RunningIntervalProtocol } from "./types";

/**
 * Prowadzenie przy zablokowanym ekranie (iOS). Kroki receptury są czasowe,
 * więc moment każdej zmiany „Bieg/Przerwa” jest znany z góry. Gdy aplikacja
 * schodzi w tło, planujemy lokalne powiadomienia z dźwiękiem na te chwile;
 * po powrocie je anulujemy, a licznik wylicza krok z czasu biegu.
 * Pauza (w aplikacji) zawsze anuluje zaplanowane sygnały.
 */

/** Zakres id osobny od przypomnień Fuel (1_610_000_000–1_619_999_999). */
export const RUN_CUE_ID_MIN = 1_620_000_000;
export const RUN_CUE_ID_MAX = 1_620_000_999;
/** iOS trzyma najwyżej 64 zaplanowane powiadomienia na aplikację. */
const MAX_CUES = 48;

export const isRunCueId = (id: number) => id >= RUN_CUE_ID_MIN && id <= RUN_CUE_ID_MAX;

export function lockScreenCuesAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("LocalNotifications");
  } catch {
    return false;
  }
}

export interface PlannedCue {
  id: number;
  at: number;
  title: string;
  body: string;
}

/**
 * Plan sygnałów od bieżącej chwili: dla każdej przyszłej granicy kroku
 * powstaje jedno powiadomienie z nazwą następnego kroku.
 */
export function planLockScreenCues(
  protocol: RunningIntervalProtocol,
  guideElapsedSec: number,
  nowMs: number,
): PlannedCue[] {
  const { totalSec } = stepBoundaries(protocol);
  const ahead = crossedSteps(protocol, guideElapsedSec, totalSec);
  return ahead.slice(0, MAX_CUES).map(({ index, endSec }, order) => {
    const next = protocol.steps[index + 1] ?? null;
    const rep = repLabel(next);
    return {
      id: RUN_CUE_ID_MIN + order,
      at: Math.round(nowMs + (endSec - guideElapsedSec) * 1000),
      title: next ? stageLabel(next) : "Koniec biegu",
      body: next
        ? [rep, next.target.label, next.effort?.label].filter(Boolean).join(" · ")
        : "Zakończ zapis w aplikacji.",
    };
  });
}

let queue: Promise<unknown> = Promise.resolve();

function enqueue(work: () => Promise<void>): Promise<void> {
  const next = queue.catch(() => undefined).then(work);
  queue = next;
  return next;
}

export async function ensureLockScreenPermission(): Promise<boolean> {
  if (!lockScreenCuesAvailable()) return false;
  try {
    let status = await LocalNotifications.checkPermissions();
    if (status.display !== "granted") status = await LocalNotifications.requestPermissions();
    return status.display === "granted";
  } catch {
    return false;
  }
}

export function cancelLockScreenCues(): Promise<void> {
  return enqueue(async () => {
    if (!lockScreenCuesAvailable()) return;
    const pending = await LocalNotifications.getPending();
    const own = pending.notifications.filter((n) => isRunCueId(n.id));
    if (own.length) await LocalNotifications.cancel({ notifications: own });
    const delivered = await LocalNotifications.getDeliveredNotifications();
    const shown = delivered.notifications.filter((n) => isRunCueId(n.id));
    if (shown.length)
      await LocalNotifications.removeDeliveredNotifications({ notifications: shown });
  }).catch(() => undefined);
}

export function scheduleLockScreenCues(cues: PlannedCue[]): Promise<void> {
  return enqueue(async () => {
    if (!lockScreenCuesAvailable() || !cues.length) return;
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== "granted") return;
    const pending = await LocalNotifications.getPending();
    const own = pending.notifications.filter((n) => isRunCueId(n.id));
    if (own.length) await LocalNotifications.cancel({ notifications: own });
    const future = cues.filter((cue) => cue.at > Date.now() + 500);
    if (!future.length) return;
    await LocalNotifications.schedule({
      notifications: future.map((cue) => ({
        id: cue.id,
        title: cue.title,
        body: cue.body,
        schedule: { at: new Date(cue.at), allowWhileIdle: true },
        sound: undefined,
        extra: { kind: "run-cue" },
      })),
    });
  }).catch(() => undefined);
}
