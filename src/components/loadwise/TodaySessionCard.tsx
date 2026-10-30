import { useEffect, useState } from "react";
import { ArrowRight, Clock, PauseCircle, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { professionalSessionTitle } from "@/lib/loadwise/labels";
import { buildStartSessionSummary } from "@/lib/loadwise/startSessionSummary";
import type { SessionCompletion, SessionDay } from "@/lib/loadwise/types";

export function TodaySessionCard({
  plan,
  completions,
  todayIso,
  onOpen,
  onPrepare,
}: {
  plan: SessionDay[];
  completions: Record<string, SessionCompletion>;
  todayIso: string;
  onOpen: (date: string, slot: 1 | 2) => void;
  onPrepare?: (date: string, slot: 1 | 2) => void;
}) {
  const [, refresh] = useState(0);
  const summary = buildStartSessionSummary(plan, completions, todayIso);
  const expiresAt = summary.kind === "active" ? summary.expiresAt : null;
  useEffect(() => {
    const update = () => refresh((value) => value + 1);
    const timeout =
      expiresAt === null
        ? undefined
        : window.setTimeout(update, Math.max(1, expiresAt - Date.now()));
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [expiresAt]);

  const target = "session" in summary ? summary : null;
  const active = summary.kind === "active";
  const blocked = summary.kind === "blocked";
  const title = target
    ? professionalSessionTitle(target.session.title)
    : summary.kind === "completed"
      ? "Dzisiejsze sesje ukończone"
      : summary.kind === "rest"
        ? "Dziś odpoczynek"
        : summary.kind === "unavailable"
          ? "Dziś bez treningu"
          : "Sprawdź swój plan";
  const description = blocked
    ? "Trening jest wstrzymany. Otwórz zalecenia przed dalszym wysiłkiem."
    : active
      ? "Wróć do rozpoczętej sesji i kontynuuj w jej ekranie."
      : target
        ? "Ćwiczenia, przerwy i zapis wykonania w jednym miejscu."
        : summary.kind === "completed"
          ? "Wykonanie możesz sprawdzić w Postępie."
          : summary.kind === "rest" || summary.kind === "unavailable"
            ? "Nie musisz dokładać kolejnej sesji."
            : "Aktualne jednostki znajdziesz w planie tygodnia.";

  return (
    <section
      className="soft-card border-primary/25 bg-primary/[0.035] px-5 py-5"
      aria-labelledby="today-session-title"
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-primary">
        {blocked ? <PauseCircle className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {active ? "TRENING ROZPOCZĘTY" : "DZISIEJSZY TRENING"}
      </div>
      <h2 id="today-session-title" className="mt-3 text-[22px] font-semibold tracking-[-0.025em]">
        {title}
      </h2>
      {target && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {target.session.durationMin > 0 && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> {target.session.durationMin} min w planie
            </span>
          )}
          {(target.slot === 2 || target.session.secondSession) && <span>Sesja {target.slot}</span>}
          {target.session.date !== todayIso && <span>Rozpoczęta {target.session.date}</span>}
        </div>
      )}
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
      {target && (
        <Button
          type="button"
          className="mt-4 h-12 w-full rounded-full text-[15px]"
          onPointerDown={() => onPrepare?.(target.session.date, target.slot)}
          onFocus={() => onPrepare?.(target.session.date, target.slot)}
          onClick={() => onOpen(target.session.date, target.slot)}
        >
          {blocked ? "Sprawdź zalecenia" : active ? "Wróć do treningu" : "Otwórz trening"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </section>
  );
}
