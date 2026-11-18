import { useState } from "react";
import { EXERCISES, adaptSession, mesoPhase, templateFor } from "./engine";
import type { CheckIn, DayPlan } from "./engine";

const KIND_TITLE: Record<string, string> = {
  strength: "Siła", run: "Bieganie", sprint: "Sprint",
  technique: "Technika z piłką", activation: "Aktywacja", recovery: "Regeneracja",
};

export function SessionSheet({
  day, checkIn, weekInCycle, onClose,
}: { day: DayPlan; checkIn: CheckIn; weekInCycle: number; onClose: () => void }) {
  const [weights, setWeights] = useState<Record<string, string>>({});
  const s = day.session;
  const module = s?.kind === "strength" || s?.kind === "sprint" ? s.kind : null;
  const found = module ? templateFor(module, weekInCycle) : null;
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
        ) : (
          <p className="mt-3 text-sm text-muted">
            Szablon tej sesji jest w przygotowaniu.
          </p>
        )}
      </div>
    </div>
  );
}
