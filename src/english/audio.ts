/**
 * Odsłuch zwrotów: wyłącznie synteza mowy urządzenia/przeglądarki (Web Speech API). Bez mikrofonu i bez płatnych usług.
 *
 *  – uruchamiane wyłącznie przyciskiem użytkownika (iOS Safari wymaga wywołania `speak` w obsłudze dotknięcia, więc samo odtwarzanie
 *    jest synchroniczne, a lista głosów ładuje się wcześniej),
 *  – poprzedni odsłuch jest zatrzymywany,
 *  – brak głosu lub błąd nie przerywa lekcji: cała treść jest dostępna tekstowo,
 *  – zależnie od przeglądarki i głosu tekst może być przetwarzany przez dostawcę (nie obiecujemy przetwarzania wyłącznie lokalnego).
 */
export type SpeakResult = "ok" | "unavailable" | "error" | "interrupted";

export const speechAvailable = (): boolean =>
  typeof window !== "undefined" && "speechSynthesis" in window && typeof (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance === "function";

/** Chrome na Androidzie zgłasza „en_GB”, Safari „en-GB”. */
const langOf = (v: Pick<SpeechSynthesisVoice, "lang">): string => v.lang.replace("_", "-").toLowerCase();
export const englishVoices = (voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice[] => voices.filter((v) => langOf(v).startsWith("en"));

/** Wybór głosu: zapamiętany przez użytkownika, potem głosy lokalne (bez wysyłania tekstu do usługi): brytyjski, amerykański, inny angielski; dopiero potem sieciowe. */
export function pickVoice(voices: readonly SpeechSynthesisVoice[], preferredName?: string | null): SpeechSynthesisVoice | null {
  const en = englishVoices(voices);
  if (!en.length) return null;
  if (preferredName) { const p = en.find((v) => v.name === preferredName); if (p) return p; }
  const rank = (v: SpeechSynthesisVoice) => (v.localService ? 0 : 3) + (langOf(v) === "en-gb" ? 0 : langOf(v) === "en-us" ? 1 : 2);
  return [...en].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))[0]!;
}

let cached: SpeechSynthesisVoice[] = [];
export const cachedVoices = (): SpeechSynthesisVoice[] => cached;

/** Lista głosów ładuje się asynchronicznie (Chrome, Safari): czekamy na zdarzenie, ale nie dłużej niż `timeoutMs`. */
export function loadVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (!speechAvailable()) return Promise.resolve([]);
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length) { cached = now; return Promise.resolve(now); }
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      synth.removeEventListener?.("voiceschanged", finish);
      clearTimeout(timer);
      cached = synth.getVoices();
      resolve(cached);
    };
    const timer = setTimeout(finish, timeoutMs);
    synth.addEventListener?.("voiceschanged", finish);
  });
}

export interface SpeakOptions { slow?: boolean; voice?: SpeechSynthesisVoice | null; startTimeoutMs?: number; maxMs?: number }

/** Zatrzymuje bieżący odsłuch (np. przy zmianie kroku lub zamknięciu lekcji). */
export function stopSpeaking(): void {
  if (speechAvailable()) { try { window.speechSynthesis.cancel(); } catch { /* ignorujemy */ } }
}

/**
 * Odtwarza tekst. Wywołuj bezpośrednio z obsługi dotknięcia (bez wcześniejszego `await`).
 * Zwraca „ok” po zakończeniu, „interrupted” gdy odsłuch zastąpił inny lub go zatrzymano, „unavailable” bez obsługi,
 * „error” przy błędzie albo gdy odtwarzanie nie ruszyło w `startTimeoutMs` (np. brak głosu).
 */
export function speak(text: string, opts: SpeakOptions = {}): Promise<SpeakResult> {
  if (!speechAvailable()) return Promise.resolve("unavailable");
  const synth = window.speechSynthesis;
  try { synth.cancel(); } catch { /* ignorujemy */ } // zatrzymanie poprzedniego odsłuchu
  const Utterance = (globalThis as unknown as { SpeechSynthesisUtterance: new (t: string) => SpeechSynthesisUtterance }).SpeechSynthesisUtterance;
  const u = new Utterance(text);
  const voice = opts.voice ?? pickVoice(cached.length ? cached : synth.getVoices());
  u.lang = voice?.lang?.replace("_", "-") ?? "en-GB";
  if (voice) u.voice = voice;
  u.rate = opts.slow ? 0.7 : 1;
  return new Promise<SpeakResult>((resolve) => {
    let finished = false, started = false;
    const end = (r: SpeakResult) => {
      if (finished) return; finished = true;
      clearTimeout(startWatch); clearTimeout(maxWatch);
      resolve(r);
    };
    u.onstart = () => { started = true; };
    u.onend = () => end("ok");
    u.onerror = (e) => end(e.error === "interrupted" || e.error === "canceled" ? "interrupted" : "error");
    const startWatch = setTimeout(() => { if (!started) { end("error"); try { synth.cancel(); } catch { /* ignorujemy */ } } }, opts.startTimeoutMs ?? 3000);
    const maxWatch = setTimeout(() => { end(started ? "ok" : "error"); try { synth.cancel(); } catch { /* ignorujemy */ } }, opts.maxMs ?? 15000);
    try { synth.speak(u); } catch { end("error"); }
  });
}
