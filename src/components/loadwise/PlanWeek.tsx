import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { SessionCompletion, SessionDay } from "@/lib/loadwise/types";
import { sessionHeading } from "@/lib/loadwise/sessionRunner/heading";
import { blockMethod, linkedLabel } from "@/lib/loadwise/blockMethod";

const MONTHS = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
const MONTHS_FULL = [
  "stycznia",
  "lutego",
  "marca",
  "kwietnia",
  "maja",
  "czerwca",
  "lipca",
  "sierpnia",
  "września",
  "października",
  "listopada",
  "grudnia",
];
const WEEKDAY = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "Sb"];
const parts = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
};

/** "2 lis", or "2 listopada" with `full`. */
export function plDate(iso: string, full = false): string {
  const { m, d } = parts(iso);
  return `${d} ${(full ? MONTHS_FULL : MONTHS)[m - 1]}`;
}
/** "2–8 listopada", "28 października – 3 listopada". */
export function plRange(from: string, to: string): string {
  const a = parts(from);
  const b = parts(to);
  return a.m === b.m
    ? `${a.d}–${b.d} ${MONTHS_FULL[b.m - 1]}`
    : `${plDate(from, true)} – ${plDate(to, true)}`;
}
function mondayOf(iso: string): string {
  const { y, m, d, dow } = parts(iso);
  const date = new Date(Date.UTC(y, m - 1, d - ((dow + 6) % 7)));
  return date.toISOString().slice(0, 10);
}

export interface PlanWeekGroup {
  monday: string;
  days: SessionDay[];
}
/** Calendar weeks, Monday first, in plan order. */
export function planWeeks(plan: SessionDay[]): PlanWeekGroup[] {
  const out: PlanWeekGroup[] = [];
  for (const day of plan) {
    const monday = mondayOf(day.date);
    const last = out[out.length - 1];
    if (last?.monday === monday) last.days.push(day);
    else out.push({ monday, days: [day] });
  }
  return out;
}

const isRest = (s: SessionDay) =>
  s.dayType === "rest" || (!s.engineV2 && !s.durationMin && s.dayType !== "match");

function Exercises({ session }: { session: SessionDay }) {
  const blocks = session.structuredSections?.flatMap((x) => x.blocks) ?? [];
  if (!blocks.length) return null;
  return (
    <details className="bw-wk-exercises">
      <summary>Ćwiczenia i dawki</summary>
      <ul>
        {blocks.map((b) => {
          const method = blockMethod(b);
          return (
            <li key={b.id} data-linked={method ? true : undefined}>
              {method && <p>{method.name}</p>}
              {b.exercises.map((e) => (
                <span key={e.id} className="bw-wk-ex">
                  {linkedLabel(b, e) && <b>{linkedLabel(b, e)}</b>}
                  <span>
                    <strong>{e.name}</strong> · {e.displayPrescription} · przerwa{" "}
                    {e.restAfterExercise}
                  </span>
                </span>
              ))}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/**
 * One calendar week at a time: a quiet seven-day strip, then an inset list of days.
 * Training rows open the session; rest days stay short and muted.
 */
export function PlanWeek({
  plan,
  todayIso,
  completions,
  preview,
  onOpen,
}: {
  plan: SessionDay[];
  todayIso: string;
  completions: Record<string, SessionCompletion>;
  /** A proposal not saved yet: rows show the exercises instead of opening a session. */
  preview: boolean;
  onOpen: (day: SessionDay, slot: 1 | 2) => void;
}) {
  const weeks = useMemo(() => planWeeks(plan), [plan]);
  const todayWeek = Math.max(
    0,
    weeks.findIndex((w) => w.days.some((d) => d.date === todayIso)),
  );
  const [chosen, setChosen] = useState<number | null>(null);
  const index = Math.min(chosen ?? todayWeek, Math.max(0, weeks.length - 1));
  const week = weeks[index];
  if (!week) return null;
  const sunday = new Date(`${week.monday}T12:00:00Z`);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const strip = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${week.monday}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const day = week.days.find((x) => x.date === iso);
    return { iso, day };
  });
  return (
    <section className="bw-wk" aria-label="Tydzień planu">
      <div className="bw-wk-head">
        <button
          type="button"
          aria-label="Poprzedni tydzień"
          disabled={index === 0}
          onClick={() => setChosen(index - 1)}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <div>
          <strong>
            Tydzień {index + 1} z {weeks.length}
          </strong>
          <small>{plRange(week.monday, sunday.toISOString().slice(0, 10))}</small>
        </div>
        <button
          type="button"
          aria-label="Następny tydzień"
          disabled={index === weeks.length - 1}
          onClick={() => setChosen(index + 1)}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <ol className="bw-wk-strip" aria-hidden="true">
        {strip.map(({ iso, day }) => (
          <li
            key={iso}
            data-today={iso === todayIso || undefined}
            data-train={(day && !isRest(day)) || undefined}
            data-match={day?.dayType === "match" || undefined}
          >
            <span>{WEEKDAY[parts(iso).dow]}</span>
            <b>{parts(iso).d}</b>
            <i />
          </li>
        ))}
      </ol>
      <ul className="bw-wk-days">
        {week.days.map((d) => {
          const sessions = [d, ...(d.secondSession ? [d.secondSession] : [])];
          const today = d.date === todayIso;
          return (
            <li key={d.date} data-today={today || undefined} data-rest={isRest(d) || undefined}>
              <div className="bw-wk-date">
                <span>{today ? "Dziś" : WEEKDAY[parts(d.date).dow]}</span>
                <b>{parts(d.date).d}</b>
              </div>
              <div className="bw-wk-sessions">
                {sessions.map((s, i) => {
                  const rest = isRest(s);
                  const heading = sessionHeading(s);
                  const done = Boolean(s.dbId && completions[s.dbId]?.completed);
                  const body = (
                    <>
                      <span className="bw-wk-copy">
                        <strong>{rest ? "Odpoczynek" : heading.title}</strong>
                        {!rest && heading.meta.length > 0 && (
                          <small>{heading.meta.join(" · ")}</small>
                        )}
                        {s.engineV2?.cycle &&
                        ["deload", "reentry", "review"].includes(s.engineV2.cycle.state) ? (
                          <small className="bw-wk-phase">{s.blockPhaseLabel}</small>
                        ) : null}
                      </span>
                      {done && <Check className="bw-wk-done" aria-label="Wykonane" />}
                    </>
                  );
                  return (
                    <div key={i} className="bw-wk-session">
                      {s.dbId && !preview && !rest ? (
                        <button
                          type="button"
                          className="bw-wk-open"
                          aria-label={`Otwórz trening: ${heading.title}, ${plDate(d.date, true)}`}
                          onClick={() => onOpen(d, i === 0 ? 1 : 2)}
                        >
                          {body}
                          <ChevronRight className="bw-wk-chevron" aria-hidden="true" />
                        </button>
                      ) : (
                        <div className="bw-wk-static">{body}</div>
                      )}
                      {preview && !rest && s.engineV2 ? <Exercises session={s} /> : null}
                    </div>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
