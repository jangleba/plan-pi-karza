import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DREAM, LEAGUES, VISION, clearAmbition, dreamLabel, loadAmbition, localISO, saveAmbition, visionLabel, type Ambition, type League } from "../engine";

const LINES = ["Każdy trening przybliża Cię do tego celu.", "Małe kroki, co tydzień. Tak się wchodzi wyżej.", "Najpierw plan, potem boisko – a boisko zaczyna się dziś."];

const STEPS = 4;

/** Ustalanie celu: pełnoekranowy kreator w 3 krokach (liga → gdzie widzisz się za rok → gdzie chciałbyś być → Twoja droga), bez przewijania strony pod spodem. */
export function GoalSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const cur = loadAmbition();
  const [league, setLeague] = useState<League | null>(cur?.league ?? null);
  const [vision, setVision] = useState<string | null>(cur?.vision ?? null);
  const [dream, setDream] = useState<string | null>(cur?.dream ?? null);
  const [step, setStep] = useState(0);
  const [back, setBack] = useState(false);
  const [closing, setClosing] = useState(false);
  const empty = !league && !vision && !dream;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const go = (n: number) => { setBack(n < step); setStep(n); };
  const close = () => { setClosing(true); setTimeout(onClose, 200); };
  const save = () => {
    if (empty) clearAmbition();
    else { const a: Ambition = { ...(league ? { league } : {}), focus: cur?.focus ?? [], ...(vision ? { vision } : {}), ...(dream ? { dream } : {}), setAt: localISO() }; saveAmbition(a); }
    onSaved();
    close();
  };

  const tile = (on: boolean) => `flex min-h-[52px] items-center justify-center rounded-2xl px-2 text-center text-[15px] leading-tight transition-colors duration-200 ${on ? "bw-sel font-semibold" : "border border-hairline bg-card"}`;
  const stagger = (i: number) => ({ animationDelay: `${Math.min(i, 14) * 28}ms` });

  const view = (
    <div className={`${closing ? "bw-backdrop-out" : "bw-backdrop"} fixed inset-0 z-[55] flex flex-col bg-canvas`} style={{ height: "100dvh", paddingTop: "env(safe-area-inset-top)" }} role="dialog" aria-modal="true" aria-label="Twój cel">
      <header className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-3">
        <button onClick={step === 0 ? close : () => go(step - 1)} aria-label={step === 0 ? "Zamknij" : "Wstecz"} className="flex h-11 w-11 items-center justify-center rounded-full text-ink active:bg-hairline">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={step === 0 ? "M6 6l12 12M18 6L6 18" : "M15 5l-7 7 7 7"} /></svg>
        </button>
        <div className="flex flex-1 gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS} aria-valuenow={step + 1} aria-label={`Krok ${step + 1} z ${STEPS}`}>
          {Array.from({ length: STEPS }, (_, i) => (
            <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-hairline"><div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style={{ width: i <= step ? "100%" : "0%" }} /></div>
          ))}
        </div>
        <span className="w-11" aria-hidden="true" />
      </header>

      <main key={step} className={`${back ? "bw-step-back" : "bw-step"} min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-3`}>
        {step === 0 && (
          <>
            <h2 className="text-[28px] font-bold leading-tight tracking-tight">Gdzie chcesz grać?</h2>
            <p className="mb-4 mt-1 text-[16px] text-muted">Wybierz poziom, do którego idziesz. To Twój kierunek na kolejne miesiące.</p>
            <div className="grid grid-cols-2 gap-2.5">
              {LEAGUES.map((l, i) => <button key={l} style={stagger(i)} onClick={() => setLeague(league === l ? null : l)} aria-pressed={league === l} className={`${tile(league === l)} bw-tile-in ${league === l ? "bw-pop" : ""}`}>{l}</button>)}
              <button style={stagger(LEAGUES.length)} onClick={() => setLeague(null)} aria-pressed={league === null} className={`${tile(league === null)} bw-tile-in col-span-2 ${league === null ? "bw-pop" : ""}`}>Jeszcze nie wiem</button>
            </div>
          </>
        )}
        {(step === 1 || step === 2) && (() => {
          const isVision = step === 1, list = isVision ? VISION : DREAM, val = isVision ? vision : dream, set = isVision ? setVision : setDream;
          return (
            <>
              <h2 className="text-[28px] font-bold leading-tight tracking-tight">{isVision ? "Gdzie widzisz się za rok?" : "Gdzie chciałbyś być?"}</h2>
              <p className="mb-4 mt-1 text-[16px] text-muted">{isVision ? "Zamknij oczy i zobacz siebie za 12 miesięcy. Co widzisz?" : "A gdyby nic Cię nie ograniczało – dokąd chcesz dojść w piłce?"}</p>
              <div className="flex flex-col gap-2.5">
                {list.map(([id, text], i) => {
                  const on = val === id;
                  return (
                    <button key={id} style={stagger(i)} onClick={() => set(on ? null : id)} aria-pressed={on} className={`bw-tile-in flex min-h-[64px] items-center gap-3 rounded-2xl px-4 text-left text-[17px] leading-snug transition-colors duration-200 ${on ? "bw-sel bw-pop font-semibold" : "border border-hairline bg-card"}`}>
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${on ? "border-accent bg-accent text-white" : "border-hairline"}`} aria-hidden="true">
                        {on && <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path className="bw-check" d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                      </span>
                      {text}
                    </button>
                  );
                })}
              </div>
            </>
          );
        })()}
        {step === 3 && (
          <div className="text-center">
            <h2 className="text-[28px] font-bold leading-tight tracking-tight">{empty ? "Bez celu na razie" : "Twoja droga"}</h2>
            <p className="mb-2 mt-1 text-[16px] text-muted">{empty ? "Cel możesz ustawić później na Starcie." : LINES[(league ? league.length : 0) % LINES.length]}</p>
            {!empty && (
              <svg viewBox="0 0 320 150" className="mx-auto mt-2 w-full max-w-sm" role="img" aria-label={league ? `Droga do: ${league}` : "Droga do celu"}>
                <path d="M30 118 C 90 118, 80 40, 160 62 S 250 30, 284 36" fill="none" stroke="#c3d9f3" strokeWidth="5" strokeLinecap="round" strokeDasharray="1 11" />
                <path className="bw-draw" pathLength="100" d="M30 118 C 90 118, 80 40, 160 62 S 250 30, 284 36" fill="none" stroke="#2f6fb3" strokeWidth="5" strokeLinecap="round" />
                <circle cx="30" cy="118" r="9" fill="#fff" stroke="#2f6fb3" strokeWidth="4" />
                <g className="bw-pop" style={{ transformOrigin: "284px 36px", animationDelay: "1.2s", animationFillMode: "backwards" }}>
                  <path d="M284 36 V6" stroke="#1d1d1f" strokeWidth="3" strokeLinecap="round" /><path d="M284 6 L310 15 L284 25 Z" fill="#2f6fb3" />
                  <circle cx="284" cy="36" r="6" fill="#2f6fb3" stroke="#fff" strokeWidth="2.5" />
                </g>
                <text x="30" y="144" textAnchor="middle" fontSize="13" fill="#6e6e73">Dziś</text>
                <text x="284" y="62" textAnchor="middle" fontSize="13" fontWeight="600" fill="#1d1d1f">{league ?? "Twój cel"}</text>
              </svg>
            )}
            {(vision || dream) && (
              <div className="mt-4 space-y-2.5 text-left">
                {vision && <div style={{ animationDelay: "600ms" }} className="bw-tile-in rounded-2xl bg-accent-soft px-4 py-3"><div className="text-[13px] text-accent/80">Za rok</div><div className="text-[17px] font-semibold text-accent">{visionLabel(vision)}</div></div>}
                {dream && <div style={{ animationDelay: "740ms" }} className="bw-tile-in rounded-2xl bg-accent-soft px-4 py-3"><div className="text-[13px] text-accent/80">Marzenie</div><div className="text-[17px] font-semibold text-accent">{dreamLabel(dream)}</div></div>}
              </div>
            )}
            {!empty && <p className="mt-5 text-[15px] text-muted">Zmienisz to w każdej chwili.</p>}
          </div>
        )}
      </main>

      <div className="shrink-0 px-5 pt-2" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
        {step < STEPS - 1 ? (
          <button onClick={() => go(step + 1)} className="bw-grad h-14 w-full rounded-[20px] text-[18px] font-semibold active:scale-[0.99]">{(step === 1 && !vision) || (step === 2 && !dream) ? "Pomiń" : "Dalej"}</button>
        ) : (
          <button onClick={save} className="bw-grad h-14 w-full rounded-[20px] text-[18px] font-semibold active:scale-[0.99]">{empty ? (cur ? "Usuń cel" : "Zamknij") : "Zaczynamy"}</button>
        )}
      </div>
    </div>
  );
  return typeof document === "undefined" ? view : createPortal(view, document.body);
}
