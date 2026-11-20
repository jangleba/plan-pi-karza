import { useEffect, useMemo, useRef, useState } from "react";
import { localISO } from "../engine";
import { cachedVoices, pickVoice, speak, speechAvailable, stopSpeaking, type SpeakResult } from "./audio";
import { PHRASE_BY_ID, lessonById } from "./content";
import { buildPieces, checkBuild, checkOptions, modelAnswer } from "./match";
import { dueCount, summarize, type EnglishDoc, type Session } from "./progress";
import { PASTEL } from "../lib/pastel";
import { advance, answer, currentStep, finish, isFinished, progressOf, score } from "./session";
import { commit, commitAndConfirm, getStatus, subscribe, type SaveOutcome } from "./storage";
import { LESSONS_META } from "./meta";
import { ROLE_LABEL, type Level, type Phrase } from "./types";

/** Po zmianie kroku wracamy na górę panelu (na małych ekranach poprzedni krok mógł zostać przewinięty). */
export const scrollPanelTop = () => { try { document.querySelector<HTMLElement>('[role="dialog"]')?.scrollTo({ top: 0 }); } catch { /* starsze przeglądarki */ } };

const today = () => localISO();
const btnBig = "w-full rounded-2xl px-5 py-4 text-left text-[17px] leading-snug";

/** Przyciski odsłuchu: tylko po dotknięciu, normalne i wolniejsze tempo; błąd lub brak głosu nie blokuje lekcji (tekst zawsze widoczny). */
export function AudioButtons({ text, voiceName }: { text: string; voiceName: string | null }) {
  const [msg, setMsg] = useState<string | null>(null);
  const available = speechAvailable();
  const play = (slow: boolean) => {
    setMsg(null);
    // wywołanie synchroniczne w obsłudze dotknięcia (wymóg iOS); głos z listy załadowanej wcześniej
    void speak(text, { slow, voice: pickVoice(cachedVoices(), voiceName) }).then((r: SpeakResult) => {
      if (r === "unavailable") setMsg("Odsłuch jest niedostępny na tym urządzeniu. Cała lekcja działa tekstowo.");
      else if (r === "error") setMsg("Nie udało się odtworzyć dźwięku (np. brak angielskiego głosu na urządzeniu). Tekst jest widoczny poniżej.");
    });
  };
  if (!available) return <p className="text-xs text-muted" role="status">Odsłuch jest niedostępny w tej przeglądarce. Cała lekcja działa tekstowo.</p>;
  return (
    <div>
      <div className="flex gap-2">
        <button onClick={() => play(false)} className="flex-1 rounded-2xl bg-canvas py-3 text-sm font-medium" aria-label={`Odsłuchaj: ${text}`}>▶ Odsłuchaj</button>
        <button onClick={() => play(true)} className="flex-1 rounded-2xl bg-canvas py-3 text-sm font-medium" aria-label={`Odsłuchaj wolniej: ${text}`}>Wolniej</button>
      </div>
      {msg && <p className="mt-2 text-xs text-muted" role="status">{msg}</p>}
    </div>
  );
}

function Learn({ p, showPl, voiceName, onNext }: { p: Phrase; showPl: boolean; voiceName: string | null; onNext: () => void }) {
  const [revealed, setRevealed] = useState(showPl);
  return (
    <>
      <span className="rounded-full px-3 py-1 text-xs font-medium" style={{ background: PASTEL.blue.s, color: PASTEL.blue.i, boxShadow: `inset 0 0 0 1px ${PASTEL.blue.c}` }}>Poznaj zwrot · {ROLE_LABEL[p.role]}</span>
      <h2 className="mt-4 text-[34px] font-semibold leading-tight tracking-tight" lang="en">{p.en}</h2>
      {revealed
        ? <p className="mt-2 text-xl text-ink/90">{p.pl}</p>
        : <button onClick={() => setRevealed(true)} className="mt-2 rounded-xl bg-canvas px-4 py-2 text-sm">Pokaż tłumaczenie</button>}
      <p className="mt-4 rounded-2xl bg-canvas px-4 py-3 text-[15px] leading-snug text-ink/85">{p.context}</p>
      <div className="mt-4"><AudioButtons text={p.en} voiceName={voiceName} /></div>
      <button onClick={onNext} className="bw-grad mt-6 w-full rounded-2xl py-4 text-base font-medium">Dalej</button>
    </>
  );
}

interface Feedback { correct: boolean; requeued: boolean; picked?: string }

function Feedback({ f, p, extra, voiceName, onNext, last }: { f: Feedback; p: Phrase; extra: string; voiceName: string | null; onNext: () => void; last: boolean }) {
  return (
    <div className="mt-5" role="status" aria-live="polite">
      <div className={`rounded-2xl px-4 py-3 ${f.correct ? "bg-green-soft text-green-ink" : "bg-red-soft text-red-ink"}`}>
        <p className="text-[17px] font-semibold">{f.correct ? "Dobrze!" : "Nie tym razem"}</p>
      </div>
      <p className="mt-3 text-[15px] leading-snug">{extra}</p>
      <p className="mt-3 rounded-2xl bg-canvas px-4 py-3 text-[15px]"><b lang="en">{p.en}</b> – {p.pl}</p>
      {f.requeued && <p className="mt-2 text-xs text-muted">Ten zwrot wróci jeszcze raz na końcu, a jutro zobaczysz go w powtórkach.</p>}
      <div className="mt-3"><AudioButtons text={p.en} voiceName={voiceName} /></div>
      <button onClick={onNext} className="bw-grad mt-4 w-full rounded-2xl py-4 text-base font-medium">{last ? "Zakończ" : "Dalej"}</button>
    </div>
  );
}

function Check({ p, salt, fb, onPick }: { p: Phrase; salt: string; fb: Feedback | null; onPick: (o: string) => void }) {
  const options = useMemo(() => checkOptions(p, salt), [p, salt]);
  return (
    <>
      <span className="rounded-full px-3 py-1 text-xs font-medium" style={{ background: PASTEL.mint.s, color: PASTEL.mint.i, boxShadow: `inset 0 0 0 1px ${PASTEL.mint.c}` }}>Co to znaczy w tej sytuacji?</span>
      <h2 className="mt-4 text-xl font-semibold leading-snug">{p.check.q}</h2>
      <div className="mt-5 flex flex-col gap-3" role="group" aria-label="Odpowiedzi">
        {options.map((o) => {
          const isCorrect = o === p.check.correct, picked = fb?.picked === o;
          const cls = !fb ? "bg-canvas" : isCorrect ? "bg-green-soft text-green-ink" : picked ? "bg-red-soft text-red-ink" : "bg-canvas opacity-60";
          return <button key={o} disabled={!!fb} onClick={() => onPick(o)} className={`${btnBig} ${cls}`}>{o}</button>;
        })}
      </div>
    </>
  );
}

function Build({ p, salt, fb, onCheck }: { p: Phrase; salt: string; fb: Feedback | null; onCheck: (placed: string[]) => void }) {
  const bank = useMemo(() => buildPieces(p, salt), [p, salt]);
  const [placed, setPlaced] = useState<number[]>([]);
  const words = placed.map((i) => bank[i]!);
  const locked = !!fb;
  return (
    <>
      <span className="rounded-full px-3 py-1 text-xs font-medium" style={{ background: PASTEL.peach.s, color: PASTEL.peach.i, boxShadow: `inset 0 0 0 1px ${PASTEL.peach.c}` }}>Ułóż odpowiedź</span>
      <h2 className="mt-4 text-xl font-semibold leading-snug">{p.build.prompt}</h2>
      <div className="mt-5 flex min-h-[68px] flex-wrap items-center gap-2 rounded-2xl border border-dashed border-hairline bg-canvas p-3" aria-label="Twoja odpowiedź" lang="en">
        {placed.length === 0 && <span className="text-sm text-muted">Dotykaj słów poniżej w odpowiedniej kolejności</span>}
        {placed.map((i, n) => (
          <button key={`${i}-${n}`} disabled={locked} onClick={() => setPlaced(placed.filter((_, k) => k !== n))} className="rounded-xl bg-card px-4 py-3 text-[17px] shadow-sm" aria-label={`Usuń: ${bank[i]}`}>{bank[i]}</button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Dostępne słowa" lang="en">
        {bank.map((w, i) => (
          <button key={i} disabled={locked || placed.includes(i)} onClick={() => setPlaced([...placed, i])} className="rounded-xl bg-canvas px-4 py-3 text-[17px] disabled:opacity-30">{w}</button>
        ))}
      </div>
      {!locked && (
        <div className="mt-5 flex gap-2">
          <button onClick={() => setPlaced([])} disabled={!placed.length} className="rounded-2xl bg-canvas px-5 py-4 text-sm disabled:opacity-40">Wyczyść</button>
          <button onClick={() => onCheck(words)} disabled={!placed.length} className="bw-grad flex-1 rounded-2xl py-4 text-base font-medium disabled:opacity-40">Sprawdź</button>
        </div>
      )}
    </>
  );
}

/** Ostrzeżenie, gdy zapis lokalny po kroku nie został potwierdzony (np. brak miejsca): nie udajemy, że postęp jest bezpieczny. */
export function LocalSaveWarning() {
  const [failed, setFailed] = useState(getStatus().local === "failed");
  useEffect(() => subscribe((s) => setFailed(s.local === "failed")), []);
  if (!failed) return null;
  return <p className="mb-4 rounded-2xl bg-red-soft px-4 py-3 text-sm text-red-ink" role="alert">Nie udało się zapisać postępu na tym urządzeniu (brak miejsca lub zablokowany zapis w przeglądarce). Ostatnie odpowiedzi mogą nie zostać zachowane.</p>;
}

export type Finish = { phase: "saving" } | { phase: "done"; outcome: SaveOutcome };

/** Zapis wyniku: „Zapisano” dopiero po potwierdzeniu; błąd jest nazwany wprost i można go ponowić. */
export function SaveNotice({ fin, onRetry }: { fin: Finish | null; onRetry: () => void }) {
  const o = fin && fin.phase === "done" ? fin.outcome : null;
  const saved = !!o && o.local && (o.cloud === "ok" || o.cloud === "off");
  return (
    <div className="mt-4" role="status" aria-live="polite">
      {!fin || fin.phase === "saving" ? <p className="text-sm text-muted">Zapisuję wynik…</p>
        : saved ? <p className="rounded-2xl bg-green-soft px-4 py-3 text-sm text-green-ink">{o!.cloud === "ok" ? "Zapisano na koncie i na tym urządzeniu." : "Zapisano na tym urządzeniu. Zaloguj się, aby synchronizować postęp z kontem."}</p>
        : !o!.local ? (
          <div className="rounded-2xl bg-red-soft px-4 py-3 text-sm text-red-ink">
            <p>Nie udało się zapisać wyniku na tym urządzeniu (brak miejsca lub zablokowany zapis w przeglądarce). Nie został zapisany.</p>
            <button onClick={onRetry} className="mt-3 w-full rounded-xl bg-card py-3 font-medium">Spróbuj ponownie</button>
          </div>
        ) : (
          <div className="rounded-2xl bg-yellow-soft px-4 py-3 text-sm text-yellow-ink">
            <p>Wynik jest zapisany na tym urządzeniu, ale nie udało się zapisać go na koncie. Synchronizacja zostanie ponowiona.</p>
            <button onClick={onRetry} className="mt-3 w-full rounded-xl bg-card py-3 font-medium">Zapisz na koncie ponownie</button>
          </div>
        )}
    </div>
  );
}

/**
 * Przebieg jednej sesji (lekcja albo powtórka): jedno zadanie na ekranie, zapis po każdym kroku i potwierdzony zapis na końcu.
 * `docRef` zawsze zawiera najnowszy stan, więc odpowiedzi nie zależą od momentu renderowania.
 */
export function Runner({ initial, docRef, setDoc, voiceName, onExit, onStart }: {
  initial: Session; docRef: React.MutableRefObject<EnglishDoc>; setDoc: (d: EnglishDoc) => void; voiceName: string | null;
  onExit: () => void; onStart: (kind: "lesson" | "review", lessonId?: string) => void;
}) {
  const [session, setSession] = useState<Session>(initial);
  const [fb, setFb] = useState<Feedback | null>(null);
  const [fin, setFin] = useState<Finish | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const finalDoc = useRef<EnglishDoc | null>(null);

  const save = (d: EnglishDoc) => { docRef.current = d; setDoc(d); commit(d); };
  const step = currentStep(session);
  const phrase = step ? PHRASE_BY_ID[step.p] : undefined;
  const salt = `${session.day}|${session.idx}`;

  useEffect(() => { stopSpeaking(); scrollPanelTop(); }, [session.idx]);
  useEffect(() => () => stopSpeaking(), []);

  const respond = (correct: boolean, picked?: string) => {
    if (fb) return; // ochrona przed podwójnym kliknięciem
    const r = answer(docRef.current, sessionRef.current, correct, today(), Date.now());
    if (!r.applied) return;
    sessionRef.current = r.session;
    setSession(r.session);
    save(r.doc);
    setFb({ correct, requeued: r.requeued, picked });
  };

  const next = () => {
    const a = advance(docRef.current, sessionRef.current, Date.now());
    if (a.session === sessionRef.current) return;
    sessionRef.current = a.session;
    setFb(null);
    setSession(a.session);
    if (isFinished(a.session)) { void finalize(a.session); return; }
    save(a.doc);
  };

  const finalize = async (s: Session) => {
    setFin({ phase: "saving" });
    const d = finish(docRef.current, s, today(), Date.now());
    finalDoc.current = d;
    docRef.current = d; setDoc(d);
    setFin({ phase: "done", outcome: await commitAndConfirm(d) });
  };
  const retrySave = async () => {
    if (!finalDoc.current) return;
    setFin({ phase: "saving" });
    setFin({ phase: "done", outcome: await commitAndConfirm(finalDoc.current) });
  };

  /* ------------------------------ ekran końcowy ------------------------------ */
  if (isFinished(session)) {
    const sc = score(session);
    const lesson = session.kind === "lesson" && session.lessonId ? lessonById(session.lessonId) : undefined;
    const sum = summarize(docRef.current, today());
    const o = fin && fin.phase === "done" ? fin.outcome : null;
    const saved = !!o && o.local && (o.cloud === "ok" || o.cloud === "off");
    return (
      <div className="bw-rise">
        <h2 className="text-2xl font-semibold tracking-tight">{session.kind === "lesson" ? "Lekcja ukończona" : "Powtórki zakończone"}</h2>
        {lesson && <p className="mt-1 text-sm text-muted">{lesson.title}</p>}
        <div className="mt-5 rounded-2xl bg-canvas px-4 py-4">
          <p className="text-[15px]">Poprawne odpowiedzi za pierwszym razem: <b>{sc.right} z {sc.total}</b></p>
          <p className="mt-2 text-xs leading-snug text-muted">
            Ukończenie lekcji to jeszcze nie utrwalenie zwrotów. Wrócą w powtórkach: jutro, potem za 3, 7, 14 i 30 dni (po poprawnych odpowiedziach).
            Zwroty do powtórki dziś: {dueCount(docRef.current, today())}.
          </p>
        </div>
        <SaveNotice fin={fin} onRetry={() => void retrySave()} />
        <div className="mt-5 flex flex-col gap-2">
          {sum.next && <button onClick={() => onStart("lesson", sum.next!.id)} disabled={!saved} className="bw-grad rounded-2xl py-4 text-base font-medium disabled:opacity-40">Następna lekcja: {sum.next.title}</button>}
          {sum.dueToday > 0 && <button onClick={() => onStart("review")} disabled={!saved} className="rounded-2xl bg-canvas py-4 text-base font-medium disabled:opacity-40">Powtórz zwroty na dziś ({sum.dueToday})</button>}
          <button onClick={onExit} className="rounded-2xl py-3 text-sm text-muted">Zamknij</button>
        </div>
      </div>
    );
  }

  if (!step || !phrase) return <button onClick={onExit} className="text-sm text-accent">‹ Wróć</button>;
  const { done, total } = progressOf(session);
  const level = LESSONS_META.find((l) => l.id === phrase.lesson)?.level as Level | undefined;
  const lastStep = session.idx === session.steps.length - 1;
  return (
    <div>
      <LocalSaveWarning />
      <div className="mb-5" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={`Postęp: krok ${done + 1} z ${total}`}>
        <div className="mb-1 flex justify-between text-xs text-muted"><span>Krok {done + 1} z {total}</span>{session.kind === "review" && <span>Powtórka</span>}</div>
        <div className="h-2 overflow-hidden rounded-full bg-hairline"><div className="h-full rounded-full transition-all" style={{ background: "#6fb592", width: `${Math.round((done / total) * 100)}%` }} /></div>
      </div>
      {step.k === "learn" && <Learn key={session.idx} p={phrase} showPl={level !== 3} voiceName={voiceName} onNext={next} />}
      {step.k === "check" && (
        <>
          <Check key={session.idx} p={phrase} salt={salt} fb={fb} onPick={(o) => respond(o === phrase.check.correct, o)} />
          {fb && <Feedback f={fb} p={phrase} extra={phrase.check.why} voiceName={voiceName} onNext={next} last={lastStep} />}
        </>
      )}
      {step.k === "build" && (
        <>
          <Build key={session.idx} p={phrase} salt={salt} fb={fb} onCheck={(w) => respond(checkBuild(phrase.build, w))} />
          {fb && <Feedback f={fb} p={phrase} extra={fb.correct ? phrase.build.why : `Wzorcowa odpowiedź: „${modelAnswer(phrase.build)}”. ${phrase.build.why}`} voiceName={voiceName} onNext={next} last={lastStep} />}
        </>
      )}
    </div>
  );
}
