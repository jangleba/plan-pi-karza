import { useEffect, useMemo, useRef, useState } from "react";
import { localISO } from "../engine";
import { scoped } from "../lib/store";
import { englishVoices, loadVoices, speak, speechAvailable, stopSpeaking } from "./audio";
import { ALL_CARDS, DECK_HINT, DECK_LABEL, type Deck } from "./cards";
import { FlashRunner } from "./FlashRunner";
import { deckQueue, dueQueue, progressOfCard, startFlash, type FlashSession } from "./flash";
import { LESSONS_META } from "./meta";
import { hasProgress, lessonPath, setLevel, summarize, type EnglishDoc, type Session } from "./progress";
import { isDue, MASTERED_STAGE } from "./srs";
import { Runner, scrollPanelTop } from "./Runner";
import { restore, startLesson, startReview } from "./session";
import { commitAndConfirm, getStatus, loadDoc, subscribe, syncCloud, type SyncStatus } from "./storage";
import { LEVEL_LABEL, type Level } from "./types";
import { PASTEL } from "../lib/pastel";

const LEVEL_PASTEL = { 1: PASTEL.mint, 2: PASTEL.blue, 3: PASTEL.lavender } as const;
const DECK_PASTEL = { phrases: PASTEL.blue, words: PASTEL.mint, slogans: PASTEL.peach } as const;
const DECK_GLYPH = { phrases: "“ ”", words: "Aa", slogans: "!" } as const;

const today = () => localISO();
const VOICE_KEY = "englishVoice";

const LEVEL_TEXT: Record<Level, string> = {
  1: "Zaczynasz od najprostszych zwrotów: boisko, trener, pozycje i trening.",
  2: "Zaczynasz od pressingu, budowania akcji, ruchu bez piłki i rozmowy w nowym klubie.",
  3: "Zaczynasz od rozmów przed testami, oczekiwań trenera, opisu swojej roli i wiadomości do klubu.",
};

function LevelPicker({ current, onPick, onCancel }: { current: Level | null; onPick: (l: Level) => void; onCancel?: () => void }) {
  return (
    <div className="bw-rise">
      <h2 className="text-2xl font-semibold tracking-tight">{current ? "Zmień poziom" : "Jak zaczynamy?"}</h2>
      <p className="mt-2 text-sm leading-snug text-muted">
        To ustawienie trudności i kolejności lekcji, a nie certyfikowana ocena poziomu (np. CEFR). Wszystkie lekcje są zawsze dostępne, a poziom możesz zmienić w każdej chwili.
      </p>
      <div className="mt-5 flex flex-col gap-3">
        {([1, 2, 3] as Level[]).map((l) => (
          <button key={l} onClick={() => onPick(l)} aria-pressed={current === l}
            className="rounded-2xl px-5 py-4 text-left transition-colors"
            style={{ background: current === l ? LEVEL_PASTEL[l].s : "var(--color-card)", boxShadow: `inset 0 0 0 ${current === l ? 1.5 : 1}px ${current === l ? LEVEL_PASTEL[l].c : "var(--color-hairline)"}` }}>
            <span className="flex items-center gap-2 text-[17px] font-semibold"><span className="mt-[7px] h-2.5 w-2.5 shrink-0 self-start rounded-full" style={{ background: LEVEL_PASTEL[l].solid }} aria-hidden="true" />{LEVEL_LABEL[l]}</span>
            <span className="mt-1 block text-sm leading-snug text-muted">{LEVEL_TEXT[l]}</span>
          </button>
        ))}
      </div>
      {onCancel && <button onClick={onCancel} className="mt-4 w-full rounded-2xl py-3 text-sm text-muted">Anuluj</button>}
    </div>
  );
}

function StatusLine({ st, onRetry, busy }: { st: SyncStatus; onRetry: () => void; busy: boolean }) {
  if (st.local === "failed") return (
    <div className="rounded-2xl bg-red-soft px-4 py-3 text-sm text-red-ink" role="alert">
      Nie udało się zapisać postępu na tym urządzeniu. Ostatnie zmiany mogą nie zostać zachowane.
      <button onClick={onRetry} disabled={busy} className="mt-2 block w-full rounded-xl bg-card py-2.5 font-medium">Ponów zapis</button>
    </div>
  );
  if (st.cloud === "error") return (
    <div className="rounded-2xl bg-yellow-soft px-4 py-3 text-sm text-yellow-ink" role="status">
      Postęp jest zapisany na urządzeniu, ale synchronizacja z kontem się nie powiodła{st.message ? ` (${st.message})` : ""}.
      <button onClick={onRetry} disabled={busy} className="mt-2 block w-full rounded-xl bg-card py-2.5 font-medium">Spróbuj ponownie</button>
    </div>
  );
  const text = st.cloud === "syncing" ? "Zapisuję na koncie…" : st.cloud === "ok" ? "Postęp zapisany na koncie i na tym urządzeniu." : "Postęp zapisuje się na tym urządzeniu, a po zalogowaniu także na koncie.";
  return <p className="text-xs text-muted" role="status">{text}</p>;
}

export default function EnglishModule({ onClose }: { onClose: () => void }) {
  const [doc, setDocState] = useState<EnglishDoc>(loadDoc);
  const docRef = useRef(doc);
  const setDoc = (d: EnglishDoc) => { docRef.current = d; setDocState(d); };
  const [view, setView] = useState<"level" | "home" | "run" | "flash">(() => (doc.level || hasProgress(doc) ? "home" : "level"));
  const [changingLevel, setChangingLevel] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [flash, setFlash] = useState<FlashSession | null>(null);
  const [status, setStatus] = useState<SyncStatus>(getStatus());
  const [busy, setBusy] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceNameState] = useState<string | null>(() => scoped.getItem(VOICE_KEY));
  const [voiceMsg, setVoiceMsg] = useState<string | null>(null);

  useEffect(() => subscribe(setStatus), []);
  useEffect(() => { scrollPanelTop(); }, [view]);
  useEffect(() => { let alive = true; void loadVoices().then((v) => { if (alive) setVoices(v); }); return () => { alive = false; }; }, []);
  // postęp z konta (np. z innego urządzenia) dociągamy po otwarciu; zapis lokalny trwającej sesji jest zawsze świeżo łączony
  useEffect(() => { let alive = true; void syncCloud().then(() => { if (alive) setDoc(loadDoc()); }); return () => { alive = false; }; }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; stopSpeaking(); };
  });

  const close = () => { stopSpeaking(); onClose(); };
  const sum = useMemo(() => summarize(doc, today()), [doc]);
  const en = useMemo(() => englishVoices(voices), [voices]);

  const run = (s: Session) => { setSession(s); setView("run"); };
  const startLessonById = (id: string) => { const m = LESSONS_META.find((l) => l.id === id); if (m) run(startLesson(m, today())); };
  const begin = () => {
    const resumed = restore(docRef.current, today());
    if (resumed) return run(resumed);
    if (sum.next) return startLessonById(sum.next.id);
    const r = startReview(docRef.current, today());
    if (r) run(r);
  };
  const review = () => { const r = startReview(docRef.current, today()); if (r) run(r); };
  const refs = useMemo(() => ALL_CARDS.map((c) => ({ id: c.id, deck: c.deck, level: c.level })), []);
  const runFlash = (f: FlashSession | null) => { if (f) { setFlash(f); setView("flash"); } };
  const studyDeck = (deck: Deck) => runFlash(startFlash(deckQueue(docRef.current, refs, deck, today(), docRef.current.level?.value ?? null), "deck", deck, today()));
  const reviewCards = () => runFlash(startFlash(dueQueue(docRef.current, refs, today()), "due", undefined, today()));
  const retry = async () => { setBusy(true); try { await commitAndConfirm(docRef.current); setDoc(loadDoc()); } finally { setBusy(false); } };
  const pickVoice = (name: string) => { const v = name || null; setVoiceNameState(v); try { if (v) scoped.setItem(VOICE_KEY, v); else scoped.removeItem(VOICE_KEY); } catch { /* brak pamięci */ } };
  const testVoice = () => {
    setVoiceMsg(null);
    const v = en.find((x) => x.name === voiceName) ?? null;
    void speak("Nice to meet you. Man on!", { voice: v }).then((r) => { if (r === "error") setVoiceMsg("Nie udało się odtworzyć dźwięku tym głosem."); });
  };

  const pending = useMemo(() => [...Object.values(doc.phrases), ...Object.values(doc.cards)].map((p) => p.due).filter((d) => d > today()).sort()[0], [doc]);
  const dayNow = today();
  const due = sum.dueExercises;
  const dueCards = sum.dueCards;
  const deckStats = (deck: Deck) => { const cs = ALL_CARDS.filter((c) => c.deck === deck); const ps = cs.map((c) => progressOfCard(doc, c)); return { total: cs.length, seen: ps.filter(Boolean).length, mastered: ps.filter((p) => p && p.stage >= MASTERED_STAGE).length, due: ps.filter((p) => p && isDue(p, dayNow)).length }; };
  const path = useMemo(() => lessonPath(doc.level?.value ?? null), [doc.level]);

  return (
    <div className={`fixed inset-0 z-30 overflow-y-auto ${view === "run" || view === "flash" ? "bg-card" : "bg-canvas"}`} role="dialog" aria-modal="true" aria-label="Piłkarski angielski">
      <div className="mx-auto max-w-md px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="mb-5 flex items-center justify-between">
          <button onClick={close} className="-ml-2 rounded-xl px-2 py-2 text-[15px] text-accent">‹ Zamknij</button>
          <span className="text-[15px] font-semibold">Piłkarski angielski</span>
          <span className="w-16" />
        </header>

        {view === "level" && (
          <LevelPicker current={doc.level?.value ?? null} onCancel={changingLevel ? () => { setChangingLevel(false); setView("home"); } : undefined}
            onPick={(l) => { const d = setLevel(docRef.current, l, Date.now()); setDoc(d); void commitAndConfirm(d); setChangingLevel(false); setView("home"); }} />
        )}

        {view === "run" && session && (
          <Runner initial={session} docRef={docRef} setDoc={setDoc} voiceName={voiceName}
            onExit={() => { stopSpeaking(); setSession(null); setDoc(loadDoc()); setView("home"); }}
            onStart={(kind, id) => { if (kind === "review") review(); else if (id) startLessonById(id); }} />
        )}

        {view === "flash" && flash && (
          <FlashRunner initial={flash} docRef={docRef} setDoc={setDoc} voiceName={voiceName}
            onExit={() => { stopSpeaking(); setFlash(null); setDoc(loadDoc()); setView("home"); }} />
        )}

        {view === "home" && (
          <div className="bw-rise flex flex-col gap-4">
            <section className="rounded-3xl border p-5" style={{ background: `linear-gradient(135deg, ${PASTEL.blue.s} 0%, ${PASTEL.lavender.s} 100%)`, borderColor: PASTEL.blue.c }}>
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: PASTEL.blue.i }}>{sum.resuming ? "Przerwana nauka" : "Następna lekcja"}</p>
              <h2 className="mt-1 text-xl font-semibold leading-snug">{sum.next ? `Lekcja ${sum.next.order}: ${sum.next.title}` : "Wszystkie lekcje ukończone"}</h2>
              <p className="mt-1 text-sm text-muted">{sum.next ? `ok. ${sum.next.minutes} min · ${sum.next.count} zwrotów` : "Zwroty wracają w powtórkach."}</p>
              {(sum.next || due > 0) && <button onClick={begin} className="bw-grad mt-4 w-full rounded-2xl py-4 text-base font-medium">{sum.next ? sum.primary : "Powtórz"}</button>}
            </section>

            <section className="rounded-3xl border border-hairline bg-card p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-[17px] font-semibold">Powtórki na dziś</h3>
                <span className="min-w-[2.25rem] rounded-full px-3 py-1 text-center text-lg font-semibold tabular-nums" style={{ background: PASTEL.peach.s, color: PASTEL.peach.i, boxShadow: `inset 0 0 0 1px ${PASTEL.peach.c}` }}>{sum.dueToday}</span>
              </div>
              {sum.dueToday > 0 ? (
                <div className="mt-3 flex flex-col gap-2">
                  {due > 0 && <button onClick={review} className="rounded-2xl py-3.5 text-base font-medium" style={{ background: PASTEL.blue.s, color: PASTEL.blue.i }}>Zwroty z lekcji (ćwiczenia): {due}</button>}
                  {dueCards > 0 && <button onClick={reviewCards} className="rounded-2xl py-3.5 text-base font-medium" style={{ background: PASTEL.mint.s, color: PASTEL.mint.i }}>Fiszki (słowa i hasła): {dueCards}</button>}
                </div>
              ) : <p className="mt-1 text-sm text-muted">{pending ? `Brak powtórek na dziś. Najbliższa: ${pending.slice(8)}.${pending.slice(5, 7)}.` : "Powtórki pojawią się po pierwszej lekcji lub fiszkach."}</p>}
            </section>

            <section className="overflow-hidden rounded-3xl border border-hairline bg-card">
              <h3 className="px-5 pb-1 pt-4 text-xs uppercase tracking-wide text-muted">Fiszki</h3>
              {(["phrases", "words", "slogans"] as Deck[]).map((d) => {
                const st = deckStats(d);
                return (
                  <button key={d} onClick={() => studyDeck(d)} className="flex w-full items-center gap-3 border-t border-hairline px-5 py-3.5 text-left">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-semibold" style={{ background: DECK_PASTEL[d].s, color: DECK_PASTEL[d].i, boxShadow: `inset 0 0 0 1px ${DECK_PASTEL[d].c}` }} aria-hidden="true">{DECK_GLYPH[d]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium leading-snug">{DECK_LABEL[d]}</span>
                      <span className="block text-xs text-muted">{DECK_HINT[d]} Poznane {st.seen} z {st.total}, utrwalone {st.mastered}{st.due ? `, do powtórki ${st.due}` : ""}.</span>
                    </span>
                    <span className="text-muted" aria-hidden="true">›</span>
                  </button>
                );
              })}
            </section>

            <section className="rounded-3xl border border-hairline bg-card p-5">
              <h3 className="text-[17px] font-semibold">Twój postęp</h3>
              <p className="mt-2 text-sm">Ukończone lekcje: <b>{sum.lessonsDone} z {sum.lessonsTotal}</b></p>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-hairline" role="progressbar" aria-valuemin={0} aria-valuemax={sum.lessonsTotal} aria-valuenow={sum.lessonsDone} aria-label="Ukończone lekcje">
                <div className="h-full rounded-full" style={{ width: `${(sum.lessonsDone / sum.lessonsTotal) * 100}%`, background: PASTEL.mint.solid }} />
              </div>
              <p className="mt-3 text-sm">Zwroty: poznane <b>{sum.phrasesSeen}</b> z {sum.phrasesTotal}, w utrwalaniu <b>{sum.phrasesLearning}</b>, utrwalone <b>{sum.phrasesMastered}</b></p>
              <p className="mt-1 text-sm">Fiszki (słowa i hasła): poznane <b>{sum.cardsSeen}</b>, utrwalone <b>{sum.cardsMastered}</b></p>
              <p className="mt-2 text-xs leading-snug text-muted">Ukończenie lekcji i utrwalenie zwrotów to osobne rzeczy: zwrot uznajemy za utrwalony po trzech poprawnych powtórkach w rosnących odstępach.</p>
            </section>

            <section className="overflow-hidden rounded-3xl border border-hairline bg-card">
              <h3 className="px-5 pb-1 pt-4 text-xs uppercase tracking-wide text-muted">Wszystkie lekcje</h3>
              {path.map((l) => {
                const lp = doc.lessons[l.id];
                const resuming = doc.resume?.session?.lessonId === l.id;
                return (
                  <button key={l.id} onClick={() => startLessonById(l.id)} className="flex w-full items-center gap-3 border-t border-hairline px-5 py-3.5 text-left">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ${lp ? "bg-green-soft text-green-ink" : ""}`} style={lp ? undefined : { background: PASTEL.blue.s, color: PASTEL.blue.i }} aria-hidden="true">{lp ? "✓" : l.order}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium leading-snug">{l.title}</span>
                      <span className="block text-xs text-muted">{lp ? `Ukończona · poprawne za pierwszym razem: ${Math.round(lp.firstTry * 100)}%` : resuming ? "Przerwana" : `ok. ${l.minutes} min`}</span>
                    </span>
                    <span className="text-muted" aria-hidden="true">›</span>
                  </button>
                );
              })}
            </section>

            <section className="rounded-3xl border border-hairline bg-card p-5">
              <h3 className="text-[17px] font-semibold">Ustawienia</h3>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div><p className="text-sm text-muted">Poziom trudności</p><p className="text-[15px] font-medium">{doc.level ? LEVEL_LABEL[doc.level.value] : "nie wybrano"}</p></div>
                <button onClick={() => { setChangingLevel(true); setView("level"); }} className="rounded-xl bg-canvas px-4 py-2.5 text-sm font-medium">Zmień</button>
              </div>
              <div className="mt-4 border-t border-hairline pt-4">
                <p className="text-sm text-muted">Głos do odsłuchu</p>
                {!speechAvailable() ? <p className="mt-1 text-sm">Ta przeglądarka nie obsługuje syntezy mowy. Lekcje działają tekstowo.</p>
                  : en.length === 0 ? <p className="mt-1 text-sm">Nie znaleziono angielskiego głosu na urządzeniu (albo lista wciąż się ładuje). Lekcje działają tekstowo; odsłuch spróbuje użyć głosu domyślnego.</p>
                  : (
                    <div className="mt-2 flex gap-2">
                      <select value={voiceName ?? ""} onChange={(e) => pickVoice(e.target.value)} className="min-w-0 flex-1 rounded-xl bg-canvas px-3 py-3 text-[15px]" aria-label="Głos angielski">
                        <option value="">Automatycznie</option>
                        {en.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
                      </select>
                      <button onClick={testVoice} className="rounded-xl bg-canvas px-4 text-sm font-medium">Próba</button>
                    </div>
                  )}
                {voiceMsg && <p className="mt-2 text-xs text-muted" role="status">{voiceMsg}</p>}
                <p className="mt-2 text-xs leading-snug text-muted">Odsłuch to synteza mowy Twojego urządzenia, uruchamiana przyciskiem. Nie nagrywamy mikrofonu. Zależnie od przeglądarki i głosu tekst może być przetwarzany przez jej dostawcę.</p>
              </div>
            </section>

            <StatusLine st={status} onRetry={() => void retry()} busy={busy} />
            <p className="text-xs leading-snug text-muted">Wynik nauki nie jest oceną gotowości fizycznej, talentu ani szans na karierę. Służy tylko do planowania powtórek.</p>
          </div>
        )}
      </div>
    </div>
  );
}
