import { Sheet } from "../Sheet";
import { outcomeText, type AttemptClass, type BetterPlan, type CoachStep, type OptionResult, type Recording, type SimEvent } from "../engine/sim";
import type { OutcomeKind } from "../engine/sim";
import { ReplayBoard } from "./ReplayBoard";

export interface ResultBundle {
  /** Nagłówek wyniku zależny od sytuacji. */
  title: string;
  kind: OutcomeKind;
  cls: AttemptClass;
  rec: Recording;
  events: SimEvent[];
  steps: CoachStep[];
  /** Rysunek lepszego rozwiązania w chwili decyzji. */
  plan: BetterPlan | null;
  rated: OptionResult[];
  rateT: number;
  nameOf: (id?: string) => string;
  nextTitle: string;
  sameTitle: string;
}

/** Po akcji: powtórka z góry z torami podań w chwili decyzji, „Co robić” w 3 krokach, kolejna próba z innym wariantem. */
export function ResultSheet({ r, onNext, onSame }: { r: ResultBundle; onNext: () => void; onSame: () => void }) {
  return (
    <Sheet title={r.title} onClose={onNext}>
      <p className="-mt-1 mb-4 text-sm text-muted">{outcomeText(r.kind)}</p>
      <ReplayBoard rec={r.rec} events={r.events} lanes={r.rated} laneT={r.rateT} nameOf={r.nameOf} plan={r.plan} />
      {r.plan && (
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-canvas px-3 py-2.5 text-sm leading-snug">
          <span className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.plan.kind === "better" ? "#2e9e62" : "#2f6fb3" }} aria-hidden="true" />
          <span>{r.plan.label}</span>
        </p>
      )}
      <p className="mt-2 text-[11px] text-muted">Zielone ✓ – piłka zostaje u nas przez 6 s, czerwone ✕ – przecięte (symulacja, gdybyś zagrał w chwili decyzji).</p>

      <h3 className="mb-2 mt-6 text-xs uppercase tracking-wide text-muted">Co robić</h3>
      <ol className="space-y-3">
        {r.steps.map((s, i) => (
          <li key={s.title} className="flex gap-3 rounded-2xl bg-canvas p-4">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bw-grad text-xs font-semibold tabular-nums">{i + 1}</span>
            <span>
              <span className="block text-[15px] font-semibold">{s.title}</span>
              <span className="mt-0.5 block text-[15px] leading-snug">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11px] text-muted">Zasady ogólne do przeglądu trenera; ocena opcji z symulacji prototypu, nie z danych meczowych.</p>

      <button onClick={onNext} className="mt-6 w-full rounded-2xl bw-grad py-4 text-base font-medium">Kolejna próba: {r.nextTitle}</button>
      <button onClick={onSame} className="mt-2 w-full rounded-2xl py-3 text-sm text-accent">Jeszcze raz: {r.sameTitle}</button>
    </Sheet>
  );
}
