import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Brain, ChevronLeft, Shield, Swords, UserRound } from "lucide-react";
import { AppHeader } from "@/components/loadwise/ui";
import { PitchView } from "@/components/football-iq/PitchView";
import { DecisionFeedback } from "@/components/football-iq/DecisionFeedback";
import { useLoadwise } from "@/lib/loadwise/store";
import {
  IQ_GROUP_LABELS,
  toIQPositionGroup,
} from "@/lib/football-iq/positionMapping";
import { scenariosFor } from "@/lib/football-iq/scenarios";
import { evaluateDecision } from "@/lib/football-iq/evaluate";
import type {
  IQDecision,
  IQEvaluation,
  IQPhase,
  IQScenario,
} from "@/lib/football-iq/types";

export const Route = createFileRoute("/_tabs/football-iq")({
  component: FootballIQScreen,
  validateSearch: (s: Record<string, unknown>) => ({
    phase: (s.phase === "attack" || s.phase === "defense"
      ? s.phase
      : undefined) as IQPhase | undefined,
  }),
});

const INTERACTION_HINTS: Record<IQScenario["interaction"], string> = {
  move: "Przeciągnij palcem po boisku, aby pokazać swój ruch.",
  zone: "Dotknij boiska w miejscu, w którym chcesz się ustawić.",
  pass: "Dotknij partnera, do którego zagrywasz.",
  press: "Dotknij przeciwnika, na którego reagujesz.",
};

/** Jeden ekran = jeden etap decyzji. */
const STAGES = [
  {
    short: "Timing ruchu",
    title: "Wybierz moment ruchu",
    cta: "Zatwierdź moment",
    icon: Timer,
  },
  {
    short: "Ustawienie",
    title: "Ustaw ciało i pozycję",
    cta: "Zatwierdź ustawienie",
    icon: Move3D,
  },
  {
    short: "Po przyjęciu",
    title: "Wybierz działanie",
    cta: "Zatwierdź decyzję",
    icon: Swords,
  },
] as const;

const STAGE_INDEX: Record<IQScenario["interaction"], number> = {
  move: 0,
  zone: 1,
  pass: 2,
  press: 2,
};


function FootballIQScreen() {
  const { phase } = Route.useSearch();
  const { state } = useLoadwise();
  const group = toIQPositionGroup(state.profile?.position);

  if (!group) return <NoPositionScreen />;
  if (!phase) return <PhasePicker group={group} />;
  return <ScenarioSession group={group} phase={phase} />;
}

function NoPositionScreen() {
  const navigate = useNavigate();
  return (
    <div>
      <AppHeader
        title="Football IQ"
        subtitle="Nauka decyzji w realnych sytuacjach meczowych."
      />
      <div className="space-y-3 px-5">
        <div className="soft-card p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <UserRound className="h-3.5 w-3.5" /> Brak pozycji w profilu
          </div>
          <p className="mt-3 text-sm leading-relaxed text-foreground">
            Sytuacje boiskowe są dopasowane do Twojej pozycji z profilu. Uzupełnij
            pozycję w profilu, aby korzystać z Football IQ.
          </p>
          <button
            onClick={() => navigate({ to: "/profil" })}
            className="mt-4 w-full rounded-xl bg-primary p-3 text-sm font-semibold text-primary-foreground active:scale-[0.99]"
          >
            Przejdź do profilu
          </button>
        </div>
      </div>
    </div>
  );
}

function PhasePicker({ group }: { group: keyof typeof IQ_GROUP_LABELS }) {
  const navigate = useNavigate();
  const options: { phase: IQPhase; label: string; icon: typeof Swords }[] = [
    { phase: "attack", label: "Atak", icon: Swords },
    { phase: "defense", label: "Obrona", icon: Shield },
  ];
  return (
    <div>
      <AppHeader
        title="Football IQ"
        subtitle="Nauka decyzji w realnych sytuacjach meczowych."
      />
      <div className="space-y-3 px-5">
        <div className="hero-card p-5">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-[color:var(--color-graphite-muted)]">
            <Brain className="h-3.5 w-3.5" /> Twoja pozycja
          </div>
          <h2 className="mt-3 text-xl font-semibold leading-tight">
            {IQ_GROUP_LABELS[group]}
          </h2>
          <p className="mt-2 text-sm text-[color:var(--color-graphite-muted)]">
            Sytuacje są dobierane automatycznie na podstawie pozycji zapisanej w
            Twoim profilu.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {options.map((o) => (
            <button
              key={o.phase}
              onClick={() =>
                navigate({ to: "/football-iq", search: { phase: o.phase } })
              }
              className="soft-card flex min-h-[120px] flex-col items-start justify-between p-4 text-left active:scale-[0.99]"
            >
              <span className="icon-bubble h-9 w-9">
                <o.icon className="h-4 w-4" />
              </span>
              <span className="text-base font-semibold text-foreground">
                {o.label}
              </span>
            </button>
          ))}
        </div>

        <p className="px-1 text-xs text-muted-foreground">
          Wybierz fazę gry. Każda sytuacja wymaga jednej decyzji podejmowanej
          bezpośrednio na boisku.
        </p>
      </div>
    </div>
  );
}

function ScenarioSession({
  group,
  phase,
}: {
  group: keyof typeof IQ_GROUP_LABELS;
  phase: IQPhase;
}) {
  const navigate = useNavigate();
  const scenarios = useMemo(() => scenariosFor(group, phase), [group, phase]);
  const [index, setIndex] = useState(0);
  const [decision, setDecision] = useState<IQDecision | null>(null);
  const [evaluation, setEvaluation] = useState<IQEvaluation | null>(null);

  const scenario = scenarios[index];

  if (!scenario) {
    return (
      <div>
        <AppHeader title="Football IQ" subtitle={IQ_GROUP_LABELS[group]} />
        <div className="px-5">
          <div className="soft-card p-5 text-sm text-muted-foreground">
            Dla Twojej pozycji nie ma jeszcze sytuacji w tej fazie gry.
          </div>
        </div>
      </div>
    );
  }

  function confirm() {
    if (!decision || !scenario) return;
    setEvaluation(evaluateDecision(scenario, decision));
  }

  function nextScenario() {
    setDecision(null);
    setEvaluation(null);
    setIndex((i) => (i + 1) % scenarios.length);
  }

  const stageIndex = STAGE_INDEX[scenario.interaction];
  const progress = ((index + 1) / scenarios.length) * 100;

  return (
    <div className="pb-8">
      {/* Nagłówek */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 pb-3 pt-4">
          <button
            onClick={() =>
              navigate({ to: "/football-iq", search: { phase: undefined } })
            }
            aria-label="Wróć"
            className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-primary active:scale-95"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="text-sm font-bold uppercase tracking-[0.14em] text-foreground">
            BallWise IQ
          </h1>
          <span className="w-9 text-right text-sm font-semibold text-primary">
            {index + 1}/{scenarios.length}
          </span>
        </div>
        <div className="h-1 w-full bg-border">
          <div
            className="h-full rounded-r-full bg-primary transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="space-y-4 px-4 pt-4">
        {/* Instrukcja — jeden etap decyzji */}
        <div className="soft-card flex items-start gap-3 p-4">
          <span className="icon-bubble h-11 w-11 shrink-0 border border-primary/20 bg-transparent">
            <Brain className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold leading-tight text-foreground">
              {STAGES[stageIndex].title}
            </h2>
            <p className="mt-1 text-sm leading-snug text-muted-foreground">
              {scenario.description}
            </p>
          </div>
        </div>

        {/* Boisko — element główny */}
        <div className="soft-card overflow-hidden p-2">
          <PitchView
            scenario={scenario}
            decision={decision}
            onDecision={setDecision}
            locked={!!evaluation}
            best={evaluation?.best}
          />
        </div>

        {/* Sterowanie */}
        {!evaluation ? (
          <>
            <div className="soft-card p-3">
              <div className="flex items-stretch justify-between gap-1">
                {STAGES.map((s, i) => {
                  const active = i === stageIndex;
                  return (
                    <div
                      key={s.title}
                      className={`flex flex-1 flex-col items-center gap-1.5 rounded-xl px-2 py-2.5 text-center ${
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      <span
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
                          active
                            ? "bg-primary-foreground/20"
                            : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        <s.icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-[11px] font-semibold leading-tight">
                        {s.short}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 px-1 text-center text-[11px] text-muted-foreground">
                {INTERACTION_HINTS[scenario.interaction]}
              </p>
            </div>

            <button
              onClick={confirm}
              disabled={!decision}
              className="w-full rounded-2xl bg-primary p-4 text-sm font-bold uppercase tracking-wide text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-40 active:scale-[0.99]"
            >
              {STAGES[stageIndex].cta}
            </button>
          </>
        ) : (
          <DecisionFeedback evaluation={evaluation} onNext={nextScenario} />
        )}
      </div>
    </div>
  );
}

