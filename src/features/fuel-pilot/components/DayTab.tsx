import { Brain, Check, ChevronRight, Clock3 } from "lucide-react";

import type { FuelEntry, FuelRecommendation, TrainingSession } from "../engine/fuelEngine";

interface DayMoment {
  id: string;
  time: string;
  title: string;
  subtitle: string;
  state: "done" | "now" | "future";
}

interface DayTabProps {
  now: string;
  session?: TrainingSession;
  entries: FuelEntry[];
  recommendation: FuelRecommendation;
  onOpenExplanation: () => void;
  onAddEntry: () => void;
}

const timeLabel = (date: Date) =>
  new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit" }).format(date);

const shiftMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);

function buildMoments(nowIso: string, session?: TrainingSession, entries: FuelEntry[] = []): DayMoment[] {
  const now = new Date(nowIso);
  if (!session) {
    return [
      {
        id: "empty",
        time: "—",
        title: "Brak zaplanowanej sesji",
        subtitle: "Dodaj trening, aby Fuel zbudował oś dnia.",
        state: "now"
      }
    ];
  }

  const start = new Date(session.startAt);
  const recovery = shiftMinutes(start, session.durationMinutes + 30);
  const mainMeal = shiftMinutes(start, -210);
  const topUp = shiftMinutes(start, -75);
  const recentMeals = entries
    .filter((entry) => entry.kind !== "fluid")
    .sort((a, b) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime());
  const firstEntry = recentMeals[0];

  const definitions = [
    {
      id: "first-meal",
      at: firstEntry ? new Date(firstEntry.loggedAt) : shiftMinutes(mainMeal, -240),
      title: firstEntry?.label ?? "Pierwszy posiłek",
      subtitle: firstEntry ? "Dodano w Fuel" : "Regularny początek dnia"
    },
    {
      id: "main-meal",
      at: mainMeal,
      title: "Główny posiłek",
      subtitle: "Okno 3–4 h przed sesją"
    },
    {
      id: "top-up",
      at: topUp,
      title: "Uzupełnienie",
      subtitle: "Mała, znana opcja według potrzeby"
    },
    {
      id: "session",
      at: start,
      title: session.title,
      subtitle: session.load === "match" ? "Mecz" : "Sesja z Planu"
    },
    {
      id: "recovery",
      at: recovery,
      title: "Regeneracja",
      subtitle: "Węglowodany, białko i płyny"
    }
  ];

  let activeIndex = definitions.findIndex((item) => item.at.getTime() >= now.getTime());
  if (activeIndex < 0) activeIndex = definitions.length - 1;

  return definitions.map((item, index) => ({
    id: item.id,
    time: timeLabel(item.at),
    title: item.title,
    subtitle: item.subtitle,
    state: index < activeIndex ? "done" : index === activeIndex ? "now" : "future"
  }));
}

export function DayTab({ now, session, entries, recommendation, onOpenExplanation, onAddEntry }: DayTabProps) {
  const moments = buildMoments(now, session, entries);

  return (
    <section className="bw-fuel-day" aria-labelledby="bw-fuel-day-title">
      <div className="bw-fuel-section-heading">
        <div>
          <p className="bw-fuel-eyebrow">DZISIAJ</p>
          <h2 id="bw-fuel-day-title">Twój plan żywieniowy</h2>
          <p>Dopasowany do treningu i jego obciążenia.</p>
        </div>
        <button className="bw-fuel-icon-button" type="button" onClick={onAddEntry} aria-label="Dodaj jedzenie">
          <Clock3 aria-hidden="true" />
        </button>
      </div>

      <div className="bw-fuel-timeline">
        {moments.map((moment) => (
          <button
            className={`bw-fuel-timeline__item bw-fuel-timeline__item--${moment.state}`}
            key={moment.id}
            type="button"
            onClick={moment.state === "now" ? onAddEntry : undefined}
          >
            <span className="bw-fuel-timeline__marker">
              {moment.state === "done" ? <Check aria-hidden="true" /> : <span />}
            </span>
            <time>{moment.time}</time>
            <span className="bw-fuel-timeline__copy">
              <strong>{moment.title}</strong>
              <small>{moment.subtitle}</small>
            </span>
            <ChevronRight aria-hidden="true" />
          </button>
        ))}
      </div>

      <button className="bw-fuel-insight" type="button" onClick={onOpenExplanation}>
        <span className="bw-fuel-insight__icon"><Brain aria-hidden="true" /></span>
        <span>
          <strong>Plan dopasowany do treningu</strong>
          <small>{recommendation.reasons[0] ?? "Każdy krok wynika z czasu, obciążenia i Twoich danych."}</small>
        </span>
        <ChevronRight aria-hidden="true" />
      </button>
    </section>
  );
}

