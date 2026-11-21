import { useState } from "react";
import { localISO, matchWord, weekToAsk, type Profile } from "../engine";
import { useMatchWeeks } from "./useMatchWeeks";
import { WeekPrompt } from "./WeekPrompt";

/** Niedziela (albo tydzień bez wpisu): pytanie otwiera się samo, a po zamknięciu zostaje karta na Starcie i przycisk w Planie. */
export function WeekGate({ profile }: { profile: Profile }) {
  const weeks = useMatchWeeks();
  const [dismissed, setDismissed] = useState(false);
  const ask = weekToAsk(localISO(), profile.startDate, weeks);
  if (!ask || dismissed) return null;
  return <WeekPrompt profile={profile} ask={ask} onClose={() => setDismissed(true)} />;
}

/** Karta na Starcie, gdy termin na tydzień nie jest jeszcze wpisany. */
export function WeekCard({ profile }: { profile: Profile }) {
  const weeks = useMatchWeeks();
  const [open, setOpen] = useState(false);
  const ask = weekToAsk(localISO(), profile.startDate, weeks);
  if (!ask) return null;
  const word = matchWord(profile.season);
  return (
    <section className="bw-rise mb-6 rounded-3xl border border-hairline bg-card px-5 py-4" aria-label="Termin na tydzień">
      <h2 className="text-[17px] font-semibold">{ask.kind === "next" ? "Kolejny tydzień" : "Ten tydzień"}: kiedy {word}?</h2>
      <p className="mt-1 text-sm text-muted">Wpisz termin albo „nie mam”, a plan się ułoży.</p>
      <button onClick={() => setOpen(true)} className="mt-3 w-full rounded-2xl bw-grad py-3 text-sm font-medium">Wpisz</button>
      {open && <WeekPrompt profile={profile} ask={ask} onClose={() => setOpen(false)} />}
    </section>
  );
}
