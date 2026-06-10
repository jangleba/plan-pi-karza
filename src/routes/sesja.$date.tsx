import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useLoadwise } from "@/lib/loadwise/store";
import { applyReadiness } from "@/lib/loadwise/planEngine";
import { formatDateFull } from "@/lib/loadwise/labels";
import { IntensityBadge, DayTypeTag } from "@/components/loadwise/ui";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import type { ExerciseItem, SessionDay } from "@/lib/loadwise/types";
import {
  ChevronLeft,
  Clock,
  Target,
  Lightbulb,
  ShieldCheck,
  ShieldAlert,
  Ban,
  Flag,
  CheckCircle2,
} from "lucide-react";

const searchSchema = (s: Record<string, unknown>): { slot: number } => ({
  slot: Number(s.slot) === 2 ? 2 : 1,
});

export const Route = createFileRoute("/sesja/$date")({
  validateSearch: searchSchema,
  component: SessionDetail,
});

function ExerciseList({ items }: { items: ExerciseItem[] }) {
  return (
    <ul className="mt-3 space-y-3">
      {items.map((it, i) => (
        <li
          key={i}
          className="border-b border-border pb-3 last:border-0 last:pb-0"
        >
          <div className="text-sm font-medium text-foreground">{it.name}</div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            {it.prescription}
          </div>
          {it.rest && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              Przerwa: {it.rest}
            </div>
          )}
          {it.cue && (
            <div className="mt-1 text-xs text-primary">Wskazówka: {it.cue}</div>
          )}
          {it.easier && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              Łatwiej: {it.easier}
            </div>
          )}
          {it.harder && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              Trudniej: {it.harder}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function Section({ title, items }: { title: string; items: ExerciseItem[] }) {
  if (!items.length) return null;
  return (
    <div className="soft-card p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <ExerciseList items={items} />
    </div>
  );
}

function LogField({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <input
        type="number"
        min={0}
        max={10}
        placeholder="0–10"
        className="w-24 rounded-lg border border-border bg-card px-2 py-1 text-sm"
      />
    </div>
  );
}

function PostSessionLog() {
  return (
    <div className="soft-card p-4">
      <h3 className="text-sm font-semibold">Log po sesji</h3>
      <div className="mt-2 divide-y divide-border">
        <LogField label="RPE (ciężkość) 0–10" />
        <LogField label="Ból 0–10" />
        <LogField label="Bolesność mięśni 0–10" />
        <LogField label="Zmęczenie 0–10" />
      </div>
      <div className="mt-3 space-y-2">
        <span className="text-sm text-muted-foreground">Sen / notatki</span>
        <Textarea placeholder="Jak spałeś? Dodatkowe uwagi…" rows={2} />
      </div>
    </div>
  );
}

function ClubMonitoring({ session }: { session: SessionDay }) {
  const [rpe, setRpe] = useState(6);
  const load = session.durationMin * rpe;
  return (
    <>
      <div className="soft-card p-4">
        <h3 className="text-sm font-semibold">
          To jest karta monitoringu treningu klubowego.
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Nie dokładamy ćwiczeń — to Twoje główne obciążenie dnia.
        </p>
        <div className="mt-3 flex items-center gap-1.5 text-sm">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Planowany czas: {session.durationMin} min
        </div>
      </div>

      <div className="soft-card p-4">
        <h3 className="text-sm font-semibold">Przed treningiem</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Sprawdź swoją gotowość. Jeśli czujesz ból lub duże zmęczenie,
          odpowiednio dawkuj wysiłek na treningu.
        </p>
      </div>

      <div className="soft-card p-4">
        <h3 className="text-sm font-semibold">Po treningu</h3>
        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">RPE (ciężkość) 0–10</span>
            <span className="text-muted-foreground">{rpe}/10</span>
          </div>
          <Slider
            min={0}
            max={10}
            step={1}
            value={[rpe]}
            onValueChange={(v) => setRpe(v[0])}
          />
        </div>
        <div className="mt-3 divide-y divide-border">
          <LogField label="Ból 0–10" />
          <LogField label="Bolesność mięśni 0–10" />
          <LogField label="Zmęczenie 0–10" />
        </div>
        <div className="mt-3 space-y-2">
          <span className="text-sm text-muted-foreground">Sen / notatki</span>
          <Textarea placeholder="Minuty na boisku, sen, uwagi…" rows={2} />
        </div>
        <div className="mt-3 rounded-lg bg-primary/5 px-3 py-2 text-sm">
          Szacowane obciążenie ={" "}
          <span className="font-semibold">{session.durationMin} min × {rpe} RPE = {load}</span>
        </div>
      </div>
    </>
  );
}

function SessionDetail() {
  const { date } = Route.useParams();
  const { slot } = Route.useSearch();
  const router = useRouter();
  const { state, todayIso } = useLoadwise();

  const day = state.plan.find((p) => p.date === date);

  if (!day || !state.profile) {
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

  // Dla dzisiejszego dnia nakładamy gotowość na sesję główną.
  let primary: SessionDay = day;
  if (isToday) {
    primary = applyReadiness(day, state.readiness[todayIso], state.profile)
      .session;
  }

  let session: SessionDay = primary;
  if (slot === 2) {
    if (!primary.secondSession) {
      return (
        <div className="app-shell min-h-screen p-5">
          <button
            onClick={() => router.history.back()}
            className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground"
          >
            <ChevronLeft className="h-4 w-4" /> Wstecz
          </button>
          <p className="text-sm text-muted-foreground">
            Druga sesja nie jest dziś dostępna (zbyt niska gotowość, ból lub
            bliskość meczu).
          </p>
        </div>
      );
    }
    session = primary.secondSession;
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

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {formatDateFull(session.date)}
          {session.mdLabel && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 font-medium">
              <Flag className="h-3 w-3" /> {session.mdLabel}
            </span>
          )}
          {isToday && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
              Dziś
            </span>
          )}
        </div>

        {session.slotLabel && (
          <div className="mt-2 inline-flex rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
            {session.slotLabel}
          </div>
        )}

        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">
          {session.title}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <DayTypeTag type={session.dayType} />
          <IntensityBadge intensity={session.intensity} />
          <span className="inline-flex items-center gap-1">
            <Target className="h-3.5 w-3.5" /> {session.sessionType}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {session.durationMin} min
          </span>
        </div>
      </div>

      <div className="mt-5 space-y-3 px-5">
        {/* Sesje dnia — przełącznik gdy są dwie */}
        {primary.secondSession && (
          <div className="soft-card p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              2 sesje dzisiaj
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                onClick={() =>
                  router.navigate({
                    to: "/sesja/$date",
                    params: { date },
                    search: { slot: 1 },
                  })
                }
                className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                  slot === 1
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border"
                }`}
              >
                1. {primary.title}
              </button>
              <button
                onClick={() =>
                  router.navigate({
                    to: "/sesja/$date",
                    params: { date },
                    search: { slot: 2 },
                  })
                }
                className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                  slot === 2
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border"
                }`}
              >
                2. {primary.secondSession.title}
              </button>
            </div>
          </div>
        )}

        <div className="soft-card p-4">
          <div className="text-sm font-semibold">Cel sesji</div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {session.goalOfSession}
          </p>
        </div>

        <div className="soft-card flex gap-2.5 bg-primary/5 p-4">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <div className="text-sm font-semibold">Dlaczego dziś?</div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {session.whyToday}
            </p>
          </div>
        </div>

        <div className="soft-card flex gap-2.5 p-4">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <div className="text-sm font-semibold">Zarządzane ryzyko</div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {session.riskManaged}
            </p>
          </div>
        </div>

        <div className="soft-card flex gap-2.5 p-4">
          <Ban className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <div className="text-sm font-semibold">Czego dziś unikać</div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {session.avoidToday}
            </p>
          </div>
        </div>

        {session.safetyNote && (
          <div className="soft-card flex gap-2.5 bg-accent/30 p-4">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
            <div>
              <div className="text-sm font-semibold">
                Dostosowanie bezpieczeństwa
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {session.safetyNote}
              </p>
            </div>
          </div>
        )}

        {isClub ? (
          <ClubMonitoring session={session} />
        ) : (
          <>
            <Section title="Rozgrzewka" items={session.sections.warmup} />
            <Section title="Część główna" items={session.sections.main} />
            <Section
              title="Część dodatkowa / stabilizacja"
              items={session.sections.accessory}
            />
            <Section
              title="Transfer piłkarski"
              items={session.sections.footballTransfer}
            />
            <Section title="Wyciszenie" items={session.sections.cooldown} />
            <PostSessionLog />
          </>
        )}
      </div>
    </div>
  );
}
