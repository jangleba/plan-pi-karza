import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  Brain,
  Eye,
  Lightbulb,
  Smartphone,
  ChevronRight,
  ChevronLeft,
  Play,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { AppHeader } from "@/components/loadwise/ui";
import { IQ_TOPICS, type IQTopic } from "@/lib/football-iq/topics";

export const Route = createFileRoute("/_tabs/football-iq")({
  component: FootballIQScreen,
  validateSearch: (s: Record<string, unknown>) => ({
    topic: typeof s.topic === "string" ? s.topic : undefined,
    step: (typeof s.step === "string" ? s.step : undefined) as
      | "learn"
      | "setup"
      | "summary"
      | undefined,
    reps: typeof s.reps === "number" ? s.reps : undefined,
  }),
});

function FootballIQScreen() {
  const { topic: topicId, step, reps } = Route.useSearch();
  const topic = topicId ? IQ_TOPICS.find((t) => t.id === topicId) : undefined;

  if (!topic) return <TopicList />;
  if (step === "learn") return <LearnView topic={topic} />;
  if (step === "setup") return <SetupView topic={topic} />;
  if (step === "summary") return <SummaryView topic={topic} reps={reps ?? 0} />;
  return <TopicIntro topic={topic} />;
}

function SectionLabel({
  icon: Icon,
  children,
}: {
  icon: typeof Eye;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3.5 w-3.5" /> {children}
    </div>
  );
}

function TopicList() {
  return (
    <div>
      <AppHeader
        title="Football IQ"
        subtitle="Nauka decyzji w grze — na telefonie i na boisku."
      />
      <div className="space-y-3 px-5">
        <div className="hero-card p-5">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-[color:var(--color-graphite-muted)]">
            <Brain className="h-3.5 w-3.5" /> Football IQ
          </div>
          <h2 className="mt-3 text-xl font-semibold leading-tight">
            Trenuj głowę tak samo jak nogi.
          </h2>
          <p className="mt-2 text-sm text-[color:var(--color-graphite-muted)]">
            Krótka nauka, potem prawdziwe powtórzenia z piłką. Bez punktów,
            bez rankingów.
          </p>
        </div>

        {IQ_TOPICS.map((t) => (
          <Link
            key={t.id}
            to="/football-iq"
            search={{ topic: t.id }}
            className="soft-card flex items-center justify-between gap-3 p-4 transition-transform active:scale-[0.99]"
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">
                {t.title}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {t.subtitle}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}

        <div className="soft-card p-4">
          <SectionLabel icon={Lightbulb}>Więcej tematów</SectionLabel>
          <p className="mt-3 text-xs text-muted-foreground">
            Kolejne moduły (podania pod presją, decyzje 1 na 1, tempo gry)
            pojawią się w następnych aktualizacjach.
          </p>
        </div>
      </div>
    </div>
  );
}

function BackChip({ to, search }: { to: string; search?: Record<string, unknown> }) {
  return (
    <Link
      to={to}
      search={search as never}
      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="h-3.5 w-3.5" /> Wstecz
    </Link>
  );
}

function TopicIntro({ topic }: { topic: IQTopic }) {
  const steps = [
    { key: "learn", label: "Krótka nauka" },
    { key: "setup", label: "Ustawienie telefonu" },
    { key: "field", label: "Tryb boiskowy" },
    { key: "summary", label: "Podsumowanie" },
  ];
  return (
    <div>
      <AppHeader title={topic.title} subtitle={topic.subtitle} />
      <div className="space-y-3 px-5">
        <div className="px-1">
          <BackChip to="/football-iq" />
        </div>

        <div className="soft-card p-4">
          <SectionLabel icon={Brain}>Jak to działa</SectionLabel>
          <ol className="mt-3 space-y-2">
            {steps.map((s, i) => (
              <li key={s.key} className="flex items-center gap-3 text-sm">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground">
                  {i + 1}
                </span>
                <span className="text-foreground">{s.label}</span>
              </li>
            ))}
          </ol>
        </div>

        <Link
          to="/football-iq"
          search={{ topic: topic.id, step: "learn" }}
          className="soft-card flex items-center justify-between gap-3 bg-primary p-4 text-primary-foreground"
        >
          <div>
            <div className="text-sm font-semibold">Zaczynamy</div>
            <div className="mt-0.5 text-xs opacity-80">
              Krótka nauka — 30 sekund czytania.
            </div>
          </div>
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function LearnView({ topic }: { topic: IQTopic }) {
  return (
    <div>
      <AppHeader title="Krótka nauka" subtitle={topic.title} />
      <div className="space-y-3 px-5">
        <div className="px-1">
          <BackChip to="/football-iq" search={{ topic: topic.id }} />
        </div>

        <div className="soft-card p-4">
          <SectionLabel icon={Eye}>Sytuacja</SectionLabel>
          <p className="mt-3 text-sm leading-relaxed text-foreground">
            {topic.learn.situation}
          </p>
        </div>

        <div className="soft-card p-4">
          <SectionLabel icon={Lightbulb}>Na co zwrócić uwagę</SectionLabel>
          <ul className="mt-3 space-y-2">
            {topic.learn.cues.map((c) => (
              <li key={c} className="flex items-start gap-2 text-sm text-foreground">
                <Circle className="mt-1.5 h-1.5 w-1.5 shrink-0 fill-current text-muted-foreground" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="hero-card p-5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[color:var(--color-graphite-muted)]">
            Zasada
          </div>
          <p className="mt-2 text-base font-medium leading-snug">
            {topic.learn.rule}
          </p>
        </div>

        <Link
          to="/football-iq"
          search={{ topic: topic.id, step: "setup" }}
          className="soft-card flex items-center justify-between gap-3 bg-primary p-4 text-primary-foreground"
        >
          <div className="text-sm font-semibold">Dalej: ustawienie telefonu</div>
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function SetupView({ topic }: { topic: IQTopic }) {
  return (
    <div>
      <AppHeader title="Ustawienie telefonu" subtitle={topic.title} />
      <div className="space-y-3 px-5">
        <div className="px-1">
          <BackChip
            to="/football-iq"
            search={{ topic: topic.id, step: "learn" }}
          />
        </div>

        <div className="soft-card p-4">
          <SectionLabel icon={Smartphone}>Instrukcja</SectionLabel>
          <ol className="mt-3 space-y-3">
            {topic.setup.map((s, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-foreground">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{s}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="soft-card p-4">
          <SectionLabel icon={Lightbulb}>Pamiętaj</SectionLabel>
          <p className="mt-3 text-sm text-muted-foreground">
            Telefon pokazuje warunek, nie gotową odpowiedź. „Presja z lewej"
            oznacza, że sam decydujesz o wyjściu w prawo.
          </p>
        </div>

        <Link
          to="/football-iq/field"
          search={{ topic: topic.id }}
          className="soft-card flex items-center justify-between gap-3 bg-primary p-4 text-primary-foreground"
        >
          <div>
            <div className="text-sm font-semibold">Start trybu boiskowego</div>
            <div className="mt-0.5 text-xs opacity-80">
              {topic.fieldReps} losowych bodźców
            </div>
          </div>
          <Play className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function SummaryView({ topic, reps }: { topic: IQTopic; reps: number }) {
  const navigate = useNavigate();
  const done = Math.min(reps, topic.fieldReps);
  const completed = done >= topic.fieldReps;
  return (
    <div>
      <AppHeader title="Podsumowanie" subtitle={topic.title} />
      <div className="space-y-3 px-5">
        <div className="soft-card p-5 text-center">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div className="mt-3 text-sm text-muted-foreground">
            Wykonane powtórzenia
          </div>
          <div className="mt-1 text-3xl font-bold text-foreground">
            {done} / {topic.fieldReps}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {completed
              ? "Sesja ukończona. Zrób krótką notatkę mentalną: które bodźce były najtrudniejsze do odczytania?"
              : "Sesja przerwana. Wróć, gdy będziesz gotowy dokończyć."}
          </p>
        </div>

        <div className="hero-card p-5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[color:var(--color-graphite-muted)]">
            Zasada do zapamiętania
          </div>
          <p className="mt-2 text-base font-medium leading-snug">
            {topic.learn.rule}
          </p>
        </div>

        <button
          onClick={() =>
            navigate({
              to: "/football-iq/field",
              search: { topic: topic.id },
            })
          }
          className="soft-card flex w-full items-center justify-between gap-3 bg-primary p-4 text-primary-foreground"
        >
          <div className="text-sm font-semibold">Powtórz sesję</div>
          <Play className="h-4 w-4" />
        </button>

        <Link
          to="/football-iq"
          className="soft-card flex items-center justify-between gap-3 p-4"
        >
          <div className="text-sm font-medium text-foreground">
            Wróć do tematów
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </div>
    </div>
  );
}
