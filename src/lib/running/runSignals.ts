import { vibrate } from "@/lib/haptics";
import { repLabel, stageLabel } from "./guideTimeline";
import type { RunningIntervalStep } from "./types";

/**
 * Sygnały licznika: dźwięk, wibracja i (opcjonalnie) głos. Bieg zaczyna się
 * dwoma krótkimi impulsami i wysokim tonem, przerwa jednym długim i niskim,
 * koniec trzema. Ostatnie 3 s kroku odliczają krótkie tyknięcia.
 */

export const WORK_VIBRATION = [120, 70, 120] as const;
export const REST_VIBRATION = [450] as const;
export const FINISH_VIBRATION = [150, 80, 150, 80, 260] as const;
export const TICK_VIBRATION = [40] as const;

type AudioCtx = AudioContext;
let audio: AudioCtx | null = null;

function context(): AudioCtx | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    audio = audio ?? new Ctor();
    return audio;
  } catch {
    return null;
  }
}

/** iOS odblokowuje dźwięk tylko po geście — wywołaj przy „Start”. */
export function unlockSignals(): void {
  const ctx = context();
  if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => undefined);
}

function tone(frequency: number, ms: number, delayMs = 0, volume = 0.25): void {
  const ctx = context();
  if (!ctx || ctx.state !== "running") return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + delayMs / 1000;
    osc.frequency.value = frequency;
    osc.type = "sine";
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + ms / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + ms / 1000 + 0.02);
  } catch {
    /* Dźwięk jest dodatkiem; brak dźwięku nie zatrzymuje licznika. */
  }
}

export interface SignalOptions {
  sound: boolean;
  voice: boolean;
}

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pl-PL";
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  } catch {
    /* Głos jest opcjonalny. */
  }
}

export function stepAnnouncement(step: RunningIntervalStep | null): string {
  if (!step) return "Koniec. Dobra robota.";
  const rep = repLabel(step);
  return `${stageLabel(step)}${rep ? `, ${rep.replace("/", " z ").replace("/", " z ")}` : ""}. ${step.target.label}.`;
}

/** Sygnał zmiany kroku (początek nowego kroku albo koniec całego biegu). */
export function signalStep(step: RunningIntervalStep | null, options: SignalOptions): void {
  if (!step) {
    vibrate(FINISH_VIBRATION);
    if (options.sound) {
      tone(880, 160);
      tone(880, 160, 220);
      tone(1175, 320, 440);
    }
  } else if (step.kind === "work" && step.phase !== "warmup" && step.phase !== "cooldown") {
    vibrate(WORK_VIBRATION);
    if (options.sound) {
      tone(988, 140);
      tone(1319, 220, 170);
    }
  } else {
    vibrate(REST_VIBRATION);
    if (options.sound) tone(523, 420);
  }
  if (options.voice) speak(stepAnnouncement(step));
}

/** Odliczanie 3-2-1 przed końcem kroku. */
export function signalTick(options: SignalOptions): void {
  vibrate(TICK_VIBRATION);
  if (options.sound) tone(740, 90, 0, 0.18);
}

const PREFS_KEY = "ballwise:run-signals:v1";

export function loadSignalOptions(): SignalOptions {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(PREFS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<SignalOptions>) : {};
    return { sound: parsed.sound !== false, voice: parsed.voice === true };
  } catch {
    return { sound: true, voice: false };
  }
}

export function saveSignalOptions(options: SignalOptions): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(options));
  } catch {
    /* Ustawienie zostaje tylko w pamięci. */
  }
}
