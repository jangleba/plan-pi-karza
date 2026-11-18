import { useState } from "react";
import { EXERCISES, adaptSession, masTestSession, mesoPhase, runSession, templateFor } from "./engine";
import type { CheckIn, DayPlan, Mas } from "./engine";

const KIND_TITLE: Record<string, string> = {
  strength: "Siła", run: "Bieganie", sprint: "Sprint",
  technique: "Technika z piłką", activation: "Aktywacja", recovery: "Regeneracja",
};

export function SessionSheet({
  day, checkIn, weekInCycle, mas, onClose,
}: { day: DayPlan; checkIn: CheckIn; weekInCycle: number; mas: Mas | null; onClose: () => void }) {
  const [weights, setWeights] = useState<Record<string, string>>({});
  const s = day.session;
  const module = s?.kind === "strength" || s?.kind === "sprint" ? s.kind : null;
  const found = module ? templateFor(module, weekInCycle) : null;
  const run = s?.kind === "run" ? (mas ? runSession(mas, mesoPhase(weekInCycle), "intermediate", checkIn) : masTestSession()) : null;
  const adapted = found ? adaptSession(found.template, checkIn, found.deload) : null;

  return (
    <div className="fixed inset-0 z-10 flex items-end bg-black/25" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-card p-5 pb-10 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-black/10" />
        <h2 className="text-xl font-semibold">{s ? KIND_TITLE[s.kind] : "Dzień"}</h2>
        {adapted ? (
          <>
            <p className="text-sm text-muted">
              {adapted.name}{found?.deload ? " · rozładowanie" : ""}
            </p>
            {adapted.notes.map((n) => (
              <p key={n} className="mt-3 rounded-xl bg-yellow-soft px-3 py-2 text-sm text-yellow-ink">{n}</p>
            ))}
            <ol className="mt-4 flex flex-col gap-3">
              {adapted.blocks.map((b, bi) => (
                <li key={bi} className="rounded-2xl bg-canvas p-3">
                  {b.items.map((i, ii) => {
                    const e = EXERCISES[i.exerciseId];
                    const key = `${bi}-${ii}`;
                    return (
                      <div key={key} className="flex items-center justify-between gap-3 py-1.5">
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{e?.name ?? i.exerciseId}</div>
                          <div className="text-xs text-muted">
                            {i.sets} × {i.reps}
                            {i.pctRM ? ` · ${i.pctRM[0]}–${i.pctRM[1]}% maks.` : ""}
                            {i.note ? ` · ${i.note}` : ""}
                          </div>
                        </div>
                        {e?.loaded && (
                          <input
                            inputMode="decimal"
                            placeholder="kg"
                            value={weights[key] ?? ""}
                            onChange={(ev) => setWeights({ ...weights, [key]: ev.target.value })}
                            className="w-16 rounded-lg bg-card px-2 py-1.5 text-right text-sm outline-none"
                          />
                        )}
                      </div>
                    );
                  })}
                </li>
              ))}
            </ol>
          </>
        ) : run ? (
          <>
            <p className="text-sm text-muted">{run.title}</p>
            {run.notes.map((n) => (
              <p key={n} className="mt-3 rounded-xl bg-yellow-soft px-3 py-2 text-sm text-yellow-ink">{n}</p>
            ))}
            <div className="mt-4 rounded-2xl bg-canvas p-3 text-sm">
              <div className="text-xs text-muted">Rozgrzewka</div>
              <div>{run.warmup}</div>
            </div>
            {run.blocks.map((b) => (
              <div key={b.label} className="mt-3 rounded-2xl bg-canvas p-3 text-sm">
                <div className="font-medium">{b.label}</div>
                <div className="text-xs text-muted">
                  {b.reps > 1 ? `${b.sets > 1 ? `${b.sets} serie × ` : ""}${b.reps} powt. · praca ${b.workS} s, przerwa ${b.restS} s` : `${Math.round(b.workS / 60)} min`}
                  {" · "}tempo {b.paceText} · ok. {b.distanceM} m {b.reps > 1 ? "na odcinek" : ""}
                </div>
              </div>
            ))}
          </>
        ) : (
          <p className="mt-3 text-sm text-muted">
            Szablon tej sesji jest w przygotowaniu.
          </p>
        )}
        <button
          onClick={onClose}
          className="mt-6 w-full rounded-2xl bg-ink py-3 text-sm font-medium text-white"
        >
          Koniec sesji
        </button>
      </div>
    </div>
  );
}
