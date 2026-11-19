import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { englishVoices, loadVoices, pickVoice, speak, speechAvailable, stopSpeaking } from "./audio";

const voice = (name: string, lang: string, localService = true) => ({ name, lang, localService, default: false, voiceURI: name }) as SpeechSynthesisVoice;

/** Atrapa speechSynthesis: pozwala sterować zdarzeniami (start/koniec/błąd) i listą głosów. */
class FakeSynth {
  voices: SpeechSynthesisVoice[] = [];
  spoken: Array<{ text: string; rate: number; lang: string; voice: SpeechSynthesisVoice | null; u: FakeUtterance }> = [];
  cancels = 0;
  mode: "normal" | "silent" | "error" | "throw" = "normal";
  listeners = new Map<string, Array<() => void>>();
  getVoices() { return this.voices; }
  addEventListener(n: string, f: () => void) { this.listeners.set(n, [...(this.listeners.get(n) ?? []), f]); }
  removeEventListener(n: string, f: () => void) { this.listeners.set(n, (this.listeners.get(n) ?? []).filter((x) => x !== f)); }
  fire(n: string) { for (const f of this.listeners.get(n) ?? []) f(); }
  cancel() { this.cancels++; const last = this.spoken.at(-1); if (last && !last.u.done) { last.u.done = true; last.u.onerror?.({ error: "interrupted" }); } }
  speak(u: FakeUtterance) {
    if (this.mode === "throw") throw new Error("boom");
    this.spoken.push({ text: u.text, rate: u.rate, lang: u.lang, voice: u.voice, u });
    if (this.mode === "normal") setTimeout(() => { u.onstart?.(); setTimeout(() => { if (!u.done) { u.done = true; u.onend?.(); } }, 5); }, 1);
    if (this.mode === "error") setTimeout(() => { u.done = true; u.onerror?.({ error: "synthesis-failed" }); }, 1);
  }
}
class FakeUtterance { text: string; rate = 1; lang = ""; voice: SpeechSynthesisVoice | null = null; done = false;
  onstart?: () => void; onend?: () => void; onerror?: (e: { error: string }) => void; constructor(t: string) { this.text = t; } }

let synth: FakeSynth;
beforeEach(() => {
  synth = new FakeSynth();
  vi.stubGlobal("window", { speechSynthesis: synth });
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("wybór głosu angielskiego", () => {
  const list = [voice("Polski", "pl-PL"), voice("Daniel", "en-GB"), voice("Samantha", "en-US"), voice("Online", "en-GB", false), voice("Android", "en_AU")];
  it("filtruje angielskie głosy (także zapis z podkreślnikiem) i preferuje brytyjski lokalny, potem amerykański, potem inne", () => {
    expect(englishVoices(list).map((v) => v.name)).toEqual(["Daniel", "Samantha", "Online", "Android"]);
    expect(pickVoice(list)?.name).toBe("Daniel");
    expect(pickVoice(list.filter((v) => v.name !== "Daniel"))?.name).toBe("Samantha");
    expect(pickVoice([voice("Android", "en_AU"), voice("Polski", "pl-PL")])?.name).toBe("Android");
    expect(pickVoice([voice("Polski", "pl-PL")])).toBeNull();
    expect(pickVoice([])).toBeNull();
  });
  it("wybór użytkownika ma pierwszeństwo, o ile głos nadal istnieje", () => {
    expect(pickVoice(list, "Samantha")?.name).toBe("Samantha");
    expect(pickVoice(list, "Nie ma takiego")?.name).toBe("Daniel");
  });
});

describe("ładowanie głosów (iOS i Chrome ładują je asynchronicznie)", () => {
  it("lista dostępna od razu", async () => { synth.voices = [voice("Daniel", "en-GB")]; expect((await loadVoices()).length).toBe(1); });
  it("lista pojawia się dopiero po zdarzeniu voiceschanged", async () => {
    const p = loadVoices(1000);
    synth.voices = [voice("Daniel", "en-GB")];
    synth.fire("voiceschanged");
    expect((await p).map((v) => v.name)).toEqual(["Daniel"]);
  });
  it("brak zdarzenia i brak głosów: kończy się po limicie czasu pustą listą (bez zawieszenia)", async () => {
    vi.useFakeTimers();
    const p = loadVoices(1500);
    await vi.advanceTimersByTimeAsync(1600);
    expect(await p).toEqual([]);
  });
  it("brak obsługi syntezy mowy: pusta lista i „unavailable”", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("window", {});
    expect(speechAvailable()).toBe(false);
    expect(await loadVoices()).toEqual([]);
    expect(await speak("Man on!")).toBe("unavailable");
    expect(() => stopSpeaking()).not.toThrow();
  });
});

describe("odtwarzanie", () => {
  it("normalne i wolniejsze tempo, wybrany głos i język; wynik „ok” po zakończeniu", async () => {
    const v = voice("Daniel", "en-GB");
    expect(await speak("Man on!", { voice: v })).toBe("ok");
    expect(await speak("Man on!", { voice: v, slow: true })).toBe("ok");
    expect(synth.spoken.map((s) => [s.rate, s.lang, s.voice?.name])).toEqual([[1, "en-GB", "Daniel"], [0.7, "en-GB", "Daniel"]]);
  });
  it("bez dostępnego głosu mimo to próbuje z językiem en-GB (iOS potrafi mówić bez jawnie wskazanego głosu)", async () => {
    expect(await speak("Time!")).toBe("ok");
    expect(synth.spoken[0]).toMatchObject({ lang: "en-GB", voice: null });
  });
  it("uruchomienie nowego odsłuchu zatrzymuje poprzedni (poprzedni kończy się jako „interrupted”, nie jako błąd)", async () => {
    synth.mode = "silent"; // poprzedni „trwa”
    const first = speak("one", { voice: voice("Daniel", "en-GB"), startTimeoutMs: 50, maxMs: 80 });
    synth.mode = "normal";
    const second = speak("two", { voice: voice("Daniel", "en-GB") });
    expect(await first).toBe("interrupted");
    expect(await second).toBe("ok");
    expect(synth.cancels).toBeGreaterThanOrEqual(2);
  });
  it("błąd syntezy lub wyjątek: „error”, bez rzucania wyjątku (lekcja trwa dalej tekstowo)", async () => {
    synth.mode = "error";
    expect(await speak("x")).toBe("error");
    synth.mode = "throw";
    expect(await speak("x")).toBe("error");
  });
  it("odtwarzanie, które nie rusza (np. niedostępny głos): po limicie czasu „error”, a nie wieczne oczekiwanie", async () => {
    synth.mode = "silent";
    vi.useFakeTimers();
    const p = speak("x", { startTimeoutMs: 3000 });
    await vi.advanceTimersByTimeAsync(3100);
    expect(await p).toBe("error");
  });
  it("stopSpeaking zatrzymuje trwający odsłuch", async () => {
    synth.mode = "silent";
    const p = speak("x", { maxMs: 500, startTimeoutMs: 500 });
    stopSpeaking();
    expect(await p).toBe("interrupted");
  });
});
