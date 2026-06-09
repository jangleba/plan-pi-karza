import { createFileRoute, Link } from "@tanstack/react-router";
import { useLoadwise } from "@/lib/loadwise/store";
import {
  formatDate,
  shortDayName,
} from "@/lib/loadwise/labels";
import { parseIso } from "@/lib/loadwise/labels";
import {
  AppHeader,
  IntensityBadge,
  DayTypeTag,
  Disclaimer,
} from "@/components/loadwise/ui";
import {
  Clock,
  Target,
  ChevronRight,
  ShieldCheck,
  ClipboardList,
} from "lucide-react";

export const Route = createFileRoute("/_tabs/plan")({
  component: PlanScreen,
});

function PlanScreen() {
  const { state, todayIso } = useLoadwise();
  const plan = state.plan;

  return (
    <div>
      <AppHeader
        title="Plan 7 dni"
        subtitle="Patrzymy tylko do przodu — od dzisiaj."
      />

      <div className="space-y-3 px-5">
        {plan.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Brak planu. Uzupełnij profil w onboardingu.
          </p>
        )}
        {plan.map((day) => {
          const isToday = day.date === todayIso;
          const isClub = day.dayType === "club";
          const hasTwo = !!day.secondSession;
          return (
            <div
              key={day.date}
              className={`soft-card block p-4 ${isToday ? "ring-2 ring-primary" : ""}`}
            >
              <Link
                to="/sesja/$date"
                params={{ date: day.date }}
                search={{ slot: 1 }}
                className="block"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {shortDayName(parseIso(day.date))} ·{" "}
                        {formatDate(day.date)}
                      </span>
                      {isToday && (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                          Dziś
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1.5 truncate text-base font-semibold">
                      {day.title}
                    </h3>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <DayTypeTag type={day.dayType} />
                  <IntensityBadge intensity={day.intensity} />
                  <span className="inline-flex items-center gap-1">
                    <Target className="h-3.5 w-3.5" /> {day.goalLabel}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {day.durationMin} min
                  </span>
                </div>

                <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
                  {day.reason}
                </p>
              </Link>

              {hasTwo && day.secondSession && (
                <div className="mt-3 rounded-lg bg-muted/60 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Layers className="h-3.5 w-3.5" /> 2 sesje dzisiaj
                  </div>
                  <div className="mt-2 space-y-1.5">
                    <Link
                      to="/sesja/$date"
                      params={{ date: day.date }}
                      search={{ slot: 1 }}
                      className="flex items-center justify-between rounded-md bg-card px-3 py-2 text-xs font-medium"
                    >
                      <span className="truncate">1. {day.title}</span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </Link>
                    <Link
                      to="/sesja/$date"
                      params={{ date: day.date }}
                      search={{ slot: 2 }}
                      className="flex items-center justify-between rounded-md bg-card px-3 py-2 text-xs font-medium"
                    >
                      <span className="truncate">
                        2. {day.secondSession.title}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </Link>
                  </div>
                </div>
              )}

              {isClub && (
                <Link
                  to="/sesja/$date"
                  params={{ date: day.date }}
                  search={{ slot: 1 }}
                  className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground"
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  Karta monitoringu — bez dodatkowych ćwiczeń.
                </Link>
              )}

              {day.safetyNote && (
                <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-accent/40 px-3 py-2 text-xs text-accent-foreground">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{day.safetyNote}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Disclaimer />
    </div>
  );
}
