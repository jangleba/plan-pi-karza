import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useLoadwise } from "@/lib/loadwise/store";
import { applyReadiness } from "@/lib/loadwise/planEngine";
import { formatDateFull } from "@/lib/loadwise/labels";
import { IntensityBadge, DayTypeTag } from "@/components/loadwise/ui";
import type { ExerciseItem, SessionDay } from "@/lib/loadwise/types";
import { ChevronLeft, Clock, Target, Lightbulb, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/sesja/$date")({
  component: SessionDetail,
});

function Section({ title, items }: { title: string; items: ExerciseItem[] }) {
  if (!items.length) return null;
  return (
    <div className="soft-card p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <ul className="mt-3 space-y-3">
        {items.map((it, i) => (
          <li key={i} className="border-b border-border pb-3 last:border-0 last:pb-0">
            <div className="text-sm font-medium text-foreground">{it.name}</div>
            <div className="mt-0.5 text-sm text-muted-foreground">
              {it.prescription}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SessionDetail() {
  const { date } = Route.useParams();
  const router = useRouter();
  const { state, todayIso } = useLoadwise();

  const base = state.plan.find((p) => p.date === date);

  if (!base || !state.profile) {
    return (
      <div className="app-shell min-h-screen p-5">
        <button
          onClick={() => router.history.back()}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Wstecz
        </button>
        <p className="text-sm text-muted-foreground">Nie znaleziono sesji.</p>
      </div>
    );
  }

  const isToday = date === todayIso;
  let session: SessionDay = base;
  if (isToday) {
    session = applyReadiness(base, state.readiness[todayIso], state.profile)
      .session;
  }

  const isClub = session.dayType === "club";

  return (
    <div className="app-shell min-h-screen pb-12">
      <div className="px-5 pt-6">
        <button
          onClick={() => router.history.back()}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Wstecz
        </button>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {formatDateFull(session.date)}
          {isToday && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
              Dziś
            </span>
          )}
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {session.title}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <DayTypeTag type={session.dayType} />
          <IntensityBadge intensity={session.intensity} />
          <span className="inline-flex items-center gap-1">
            <Target className="h-3.5 w-3.5" /> {session.goalLabel}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {session.durationMin} min
          </span>
        </div>
      </div>

      <div className="mt-5 space-y-3 px-5">
        <div className="soft-card flex gap-2.5 bg-primary/5 p-4">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <div className="text-sm font-semibold">Dlaczego dziś?</div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {session.whyToday}
            </p>
          </div>
        </div>

        {session.safetyNote && (
          <div className="soft-card flex gap-2.5 bg-accent/30 p-4">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
            <div>
              <div className="text-sm font-semibold">Dostosowanie bezpieczeństwa</div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {session.safetyNote}
              </p>
            </div>
          </div>
        )}

        {isClub ? (
          <div className="soft-card p-4">
            <h3 className="text-sm font-semibold">Monitoring treningu klubowego</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              To dzień z klubem. Nie dokładamy ćwiczeń — zamiast tego monitoruj
              obciążenie:
            </p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>• Oceń ciężkość sesji (RPE 1–10) po treningu.</li>
              <li>• Zapisz liczbę minut na boisku.</li>
              <li>• Zwróć uwagę na nogi, ból i poziom zmęczenia.</li>
            </ul>
          </div>
        ) : (
          <>
            <Section title="Rozgrzewka" items={session.sections.warmup} />
            <Section title="Część główna" items={session.sections.main} />
            <Section
              title="Część dodatkowa / techniczna"
              items={session.sections.accessory}
            />
            <Section title="Wyciszenie" items={session.sections.cooldown} />
          </>
        )}
      </div>
    </div>
  );
}
