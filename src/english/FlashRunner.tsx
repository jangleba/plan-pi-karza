import { useEffect, useRef, useState } from "react";
import { localISO } from "../engine";
import { stopSpeaking } from "./audio";
import { CARD_BY_KEY, DECK_LABEL } from "./cards";
import { currentCard, flashScore, isFlashFinished, nextFlash, rate, type FlashSession } from "./flash";
import type { EnglishDoc } from "./progress";
import { AudioButtons, LocalSaveWarning, SaveNotice, scrollPanelTop, type Finish } from "./Runner";
import { commit, commitAndConfirm } from "./storage";
import { ROLE_LABEL } from "./types";

const today = () => localISO();

/**
 * Fiszki: jedna karta na ekranie. Ocenę („Jeszcze nie” / „Wiem”) można wybrać dopiero po odsłonięciu odpowiedzi.
 * Każda ocena zapisuje się od razu (lokalnie, z weryfikacją), a na końcu zapis jest potwierdzany przed komunikatem o sukcesie.
 */
export function FlashRunner({ initial, docRef, setDoc, voiceName, onExit }: {
  initial: FlashSession; docRef: React.MutableRefObject<EnglishDoc>; setDoc: (d: EnglishDoc) => void; voiceName: string | null; onExit: () => void;
}) {
  const [session, setSession] = useState(initial);
  const [revealed, setRevealed] = useState(false);
  const [fin, setFin] = useState<Finish | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const finalDoc = useRef<EnglishDoc | null>(null);
  const finalizing = useRef(false);

  useEffect(() => { stopSpeaking(); scrollPanelTop(); }, [session.idx]);
  useEffect(() => () => stopSpeaking(), []);

  const finalize = async () => {
    if (finalizing.current) return;
    finalizing.current = true;
    setFin({ phase: "saving" });
    const d = docRef.current;
    finalDoc.current = d;
    setFin({ phase: "done", outcome: await commitAndConfirm(d) });
  };
  const retrySave = async () => {
    if (!finalDoc.current) return;
    setFin({ phase: "saving" });
    setFin({ phase: "done", outcome: await commitAndConfirm(finalDoc.current) });
  };

  const onRate = (known: boolean) => {
    if (!revealed) return; // oceny nie da się wybrać bez zobaczenia odpowiedzi
    const r = rate(docRef.current, sessionRef.current, known, today(), Date.now());
    if (!r.applied) return; // podwójne kliknięcie
    docRef.current = r.doc; setDoc(r.doc); commit(r.doc);
    const next = nextFlash(r.session);
    sessionRef.current = next;
    setSession(next);
    setRevealed(false);
    if (isFlashFinished(next)) void finalize();
  };

  if (isFlashFinished(session)) {
    const sc = flashScore(session);
    const o = fin && fin.phase === "done" ? fin.outcome : null;
    return (
      <div className="bw-rise">
        <h2 className="text-2xl font-semibold tracking-tight">Fiszki zakończone</h2>
        <p className="mt-1 text-sm text-muted">{session.scope === "due" ? "Powtórka fiszek" : session.deck ? DECK_LABEL[session.deck] : ""}</p>
        <div className="mt-5 rounded-2xl bg-canvas px-4 py-4">
          <p className="text-[15px]">Znałeś(-aś) za pierwszym razem: <b>{sc.known} z {sc.total}</b></p>
          <p className="mt-2 text-xs leading-snug text-muted">Karty, których jeszcze nie znasz, wrócą jutro. Poprawnie przypomniane wracają za 3, 7, 14 i 30 dni.</p>
        </div>
        <SaveNotice fin={fin} onRetry={() => void retrySave()} />
        <button onClick={onExit} disabled={!o} className="bw-grad mt-5 w-full rounded-2xl py-4 text-base font-medium disabled:opacity-40">Wróć</button>
      </div>
    );
  }

  const it = currentCard(session)!;
  const card = CARD_BY_KEY[`${it.deck}:${it.id}`];
  if (!card) return <button onClick={onExit} className="text-sm text-accent">‹ Wróć</button>;
  const total = session.items.length;
  return (
    <div>
      <LocalSaveWarning />
      <div className="mb-5" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={session.idx} aria-label={`Karta ${session.idx + 1} z ${total}`}>
        <div className="mb-1 flex justify-between text-xs text-muted"><span>Karta {session.idx + 1} z {total}</span><span>{DECK_LABEL[card.deck]}</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-hairline"><div className="h-full rounded-full transition-all" style={{ background: "#6fb592", width: `${Math.round((session.idx / total) * 100)}%` }} /></div>
      </div>

      <div className="rounded-3xl border border-hairline bg-card px-5 py-8 text-center">
        <p className="text-xs text-muted">{[card.role !== "both" ? ROLE_LABEL[card.role] : null, it.retry ? "jeszcze raz" : null].filter(Boolean).join(" · ") || " "}</p>
        <h2 className="mt-3 text-[32px] font-semibold leading-tight tracking-tight" lang="en">{card.en}</h2>
        {revealed ? (
          <div className="bw-rise mt-5 border-t border-hairline pt-5" aria-live="polite">
            <p className="text-xl">{card.pl}</p>
            <p className="mt-3 text-left text-sm leading-snug text-ink/80">{card.note}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-4"><AudioButtons text={card.en} voiceName={voiceName} /></div>

      {!revealed ? (
        <button onClick={() => setRevealed(true)} className="bw-grad mt-5 w-full rounded-2xl py-4 text-base font-medium">Pokaż odpowiedź</button>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button onClick={() => onRate(false)} className="rounded-2xl bg-red-soft py-4 text-base font-medium text-red-ink">Jeszcze nie</button>
          <button onClick={() => onRate(true)} className="rounded-2xl bg-green-soft py-4 text-base font-medium text-green-ink">Wiem</button>
        </div>
      )}
    </div>
  );
}
