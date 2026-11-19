/** Dźwięk, wibracja i blokada wygaszania ekranu na czas narzędzia – wszystko opcjonalne (brak wsparcia = ciche pominięcie). */
let ctx: AudioContext | null = null;

/** Wywołaj po dotknięciu użytkownika (przeglądarki wymagają gestu, by uruchomić dźwięk). */
export function prepareAudio(): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC && !ctx) ctx = new AC();
    void ctx?.resume();
  } catch { /* brak dźwięku */ }
}

export function beep(freq = 880, ms = 90): void {
  try {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
    o.connect(g).connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + ms / 1000 + 0.02);
  } catch { /* brak dźwięku */ }
}

export function buzz(ms = 40): void { try { navigator.vibrate?.(ms); } catch { /* brak wibracji */ } }

/** Ekran nie gaśnie podczas ćwiczenia; zwraca funkcję zwalniającą. */
export async function keepAwake(): Promise<() => void> {
  try {
    const nav = navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const lock = await nav.wakeLock?.request("screen");
    return () => { void lock?.release(); };
  } catch { return () => {}; }
}
