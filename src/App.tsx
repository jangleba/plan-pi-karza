import { useMemo } from "react";
import { planWeek } from "./engine";
import type { DayPlan, SessionKind } from "./engine";

const KIND_LABEL: Record<SessionKind, string> = {
  strength: "Siła",
  run: "Bieganie",
  sprint: "Sprint",
  technique: "Technika z piłką",
  activation: "Aktywacja",
  recovery: "Regeneracja",
};

/** Kolory znaczeniowe: zielony = mocna praca, żółty = lekka, czerwony = mecz. */
const KIND_TONE: Record<SessionKind, string> = {
  strength: "bg-green-soft text-green-ink",
  run: "bg-green-soft text-green-ink",
  sprint: "bg-green-soft text-green-ink",
  technique: "bg-blue-soft text-blue-ink",
  activation: "bg-yellow-soft text-yellow-ink",
  recovery: "bg-yellow-soft text-yellow-ink",
};

const WEEKDAY = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"];

function mondayOf(d: Date): string {
  const copy = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const shift = (copy.getUTCDay() + 6) % 7;
  copy.setUTCDate(copy.getUTCDate() - shift);
  return copy.toISOString().slice(0, 10);
}

function Chip({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`self-start rounded-full px-3 py-1 text-xs font-medium ${tone}`}>{children}</span>;
}

function DayRow({ day, index }: { day: DayPlan; index: number }) {
  const s = day.session;
  return (
    <li className="flex items-center gap-4 rounded-2xl bg-card px-4 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="w-10 text-center">
        <div className="text-[11px] uppercase tracking-wide text-muted">{WEEKDAY[index]}</div>
        <div className="text-lg font-semibold">{Number(day.date.slice(8))}</div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {day.isMatch && <Chip tone="bg-red-soft text-red-ink">Mecz</Chip>}
        {day.isClub && <Chip tone="bg-blue-soft text-blue-ink">Trening klubowy</Chip>}
        {s && (
          <div className="flex flex-col">
            <Chip tone={KIND_TONE[s.kind]}>
              {KIND_LABEL[s.kind]}
              {s.variant === "upper" ? " · góra" : s.variant === "light" ? " · lekki" : ""}
            </Chip>
            {s.reason && <p className="mt-1 text-xs text-muted">{s.reason}</p>}
          </div>
        )}
        {!day.isMatch && !day.isClub && !s && <span className="text-sm text-muted">Wolne</span>}
      </div>
    </li>
  );
}

export function App() {
  const weekStart = useMemo(() => mondayOf(new Date()), []);
  // Przykładowy tydzień: mecz w sobotę, trening klubowy wt i czw.
  const plan = useMemo(() => {
    const at = (n: number) => new Date(Date.parse(weekStart) + n * 86_400_000).toISOString().slice(0, 10);
    return planWeek({
      weekStart,
      matches: [at(5)],
      clubDays: [at(1), at(3)],
      level: "intermediate",
      limitedGymAccess: false,
    });
  }, [weekStart]);

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-14">
      <h1 className="text-3xl font-semibold tracking-tight">Twój tydzień</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Plan dopasowany do meczu.</p>
      <ul className="flex flex-col gap-2.5">
        {plan.days.map((d, i) => (
          <DayRow key={d.date} day={d} index={i} />
        ))}
      </ul>
      {plan.warnings.length > 0 && (
        <p className="mt-4 rounded-2xl bg-yellow-soft p-3 text-sm text-yellow-ink">
          {plan.warnings.join(" ")}
        </p>
      )}
    </main>
  );
}
