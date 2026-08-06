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

  return (
    <div className="pb-6">
      <AppHeader
        title={phase === "attack" ? "Atak" : "Obrona"}
        subtitle={`${IQ_GROUP_LABELS[group]} · sytuacja ${index + 1} z ${scenarios.length}`}
      />
      <div className="space-y-3 px-5">
        <div className="flex items-center justify-between px-1">
          <button
            onClick={() =>
              navigate({ to: "/football-iq", search: { phase: undefined } })
            }
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Zmień fazę
          </button>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {scenario.theme}
          </span>
        </div>

        <div className="soft-card p-4">
          <h2 className="text-base font-semibold text-foreground">
            {scenario.title}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {scenario.description}
          </p>
        </div>

        <div className="soft-card overflow-hidden p-2">
          <PitchView
            scenario={scenario}
            decision={decision}
            onDecision={setDecision}
            locked={!!evaluation}
            best={evaluation?.best}
          />
        </div>

        {!evaluation && (
          <>
            <p className="px-1 text-xs text-muted-foreground">
              {INTERACTION_HINTS[scenario.interaction]}
            </p>
            <button
              onClick={confirm}
              disabled={!decision}
              className="soft-card flex w-full items-center justify-center gap-2 bg-primary p-4 text-sm font-semibold text-primary-foreground disabled:opacity-40 active:scale-[0.99]"
            >
              Zatwierdź decyzję
            </button>
          </>
        )}

        {evaluation && (
          <DecisionFeedback evaluation={evaluation} onNext={nextScenario} />
        )}
      </div>
    </div>
  );
}
