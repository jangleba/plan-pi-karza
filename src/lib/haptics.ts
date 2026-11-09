import { Capacitor } from "@capacitor/core";
import { Haptics } from "@capacitor/haptics";

/** Vibration pattern in the Vibration API format: [on, off, on, ...] in ms. */
export type VibrationPattern = number | readonly number[];

/** Longest single pulse we ask the phone for, so a bad pattern cannot buzz for seconds. */
const MAX_PULSE_MS = 1000;

function pulses(pattern: VibrationPattern): { at: number; ms: number }[] {
  const steps = typeof pattern === "number" ? [pattern] : pattern;
  const out: { at: number; ms: number }[] = [];
  let at = 0;
  steps.forEach((raw, index) => {
    const ms = Number.isFinite(raw) ? Math.max(0, Math.min(MAX_PULSE_MS, raw)) : 0;
    if (index % 2 === 0 && ms > 0) out.push({ at, ms });
    at += ms;
  });
  return out;
}

function nativeHapticsAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Haptics");
  } catch {
    return false;
  }
}

/**
 * Vibrates the phone with a Vibration API pattern.
 *
 * In the native app (iPhone and Android) the Capacitor Haptics plugin plays each pulse,
 * because the iOS WebView has no `navigator.vibrate`. In a browser it falls back to
 * `navigator.vibrate` (Android Chrome); where neither exists it does nothing.
 * Returns true when a vibration was requested.
 */
export function vibrate(pattern: VibrationPattern): boolean {
  const planned = pulses(pattern);
  if (!planned.length) return false;
  if (nativeHapticsAvailable()) {
    for (const { at, ms } of planned) {
      const play = () => {
        Haptics.vibrate({ duration: ms }).catch(() => {
          /* Vibration is optional. */
        });
      };
      if (at === 0) play();
      else setTimeout(play, at);
    }
    return true;
  }
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
    return navigator.vibrate(typeof pattern === "number" ? pattern : [...pattern]);
  } catch {
    return false;
  }
}
