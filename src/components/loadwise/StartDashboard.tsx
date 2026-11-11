import type { ReactNode } from "react";
import { Brain, CalendarDays, Check, Move, ScanLine, Target } from "lucide-react";
import { TodaySessionCard } from "./TodaySessionCard";
import type { SessionDay, SessionCompletion } from "@/lib/loadwise/types";
import { PageHeader } from "./PageHeader";
import { CycleReviewCard } from "./CycleReviewCard";
import type { CycleReview } from "@/lib/loadwise/cycleReview";

export function StartDashboard({
  name,
  avatar,
  plan,
  completions,
  todayIso,
  checkinComplete,
  busy,
  checkinDetail,
  onCheckin,
  onPlan,
  onLab,
  onReaction,
  onOpen,
  onPrepare,
  onPrepareLab,
  onPrepareReaction,
  iqTask,
  iqGoal,
  cycleReview,
}: {
  name: string;
  avatar: ReactNode;
  plan: SessionDay[];
  completions: Record<string, SessionCompletion>;
  todayIso: string;
  checkinComplete: boolean;
  busy: boolean;
  checkinDetail: string;
  onCheckin: () => void;
  onPlan: () => void;
  onLab: () => void;
  onReaction: () => void;
  onOpen: (date: string, slot: 1 | 2) => void;
  onPrepare: (date: string, slot: 1 | 2) => void;
  onPrepareLab?: () => void;
  onPrepareReaction?: () => void;
  /** Open "on the pitch" task from the last Football IQ action. */
  iqTask?: { text: string; onDone: () => void };
  /** The Football IQ aim the player is weakest at, from their own graded decisions. */
  iqGoal?: { label: string; percent: number; onOpen: () => void };
  /** Podsumowanie cyklu, który właśnie się skończył (raz na cykl). */
  cycleReview?: { review: CycleReview; onDismiss: () => void };
}) {
  return (
    <main className="bw-home-compact">
      <PageHeader
        brand
        title={`Cześć, ${name}`}
        actions={avatar}
        className="bw-page-header--inset"
      />
      {cycleReview && (
        <CycleReviewCard review={cycleReview.review} onDismiss={cycleReview.onDismiss} />
      )}
      <div className="bw-home-section-line">
        <h2>Dzisiaj</h2>
        <button onClick={onPlan}>
          <CalendarDays size={15} /> Cały tydzień
        </button>
      </div>
      <TodaySessionCard
        compact
        plan={plan}
        completions={completions}
        todayIso={todayIso}
        onOpen={onOpen}
        onPrepare={onPrepare}
      />
      <section className="bw-home-checks is-single" aria-label="Dzisiejsze ustawienia">
        <button onClick={onCheckin} disabled={busy} title={checkinDetail}>
          <Check size={18} className={checkinComplete ? "bw-tone--success" : undefined} />
          <span>
            <strong>Plan na dziś</strong>
            <small className={checkinComplete ? "bw-tone--success" : undefined}>
              {checkinComplete ? "Potwierdzony · zmień" : "Sprawdź lub zmień"}
            </small>
          </span>
        </button>
      </section>
      {iqTask && (
        <section className="bw-home-iq-task" aria-label="Zadanie na boisko z Football IQ">
          <Target size={18} aria-hidden="true" />
          <span>
            <small>Zadanie na boisko · Football IQ</small>
            <strong>{iqTask.text}</strong>
          </span>
          <button type="button" onClick={iqTask.onDone}>
            Zrobione
          </button>
        </section>
      )}
      {iqGoal && (
        <section className="bw-home-iq-task" aria-label="Twój cel w Football IQ">
          <Brain size={18} aria-hidden="true" />
          <span>
            <small>Twój cel IQ · {iqGoal.percent}% dobrych decyzji</small>
            <strong>{iqGoal.label}</strong>
          </span>
          <button type="button" onClick={iqGoal.onOpen}>
            Ćwicz
          </button>
        </section>
      )}
      <section className="bw-home-tools" aria-label="Narzędzia">
        <button onClick={onLab} onPointerDown={onPrepareLab} onFocus={onPrepareLab}>
          <ScanLine size={21} />
          <strong>BallWise Lab</strong>
          <small>Testy i pomiary</small>
        </button>
        <button onClick={onReaction} onPointerDown={onPrepareReaction} onFocus={onPrepareReaction}>
          <Move size={21} />
          <strong>Bodźce boiskowe</strong>
          <small>Kierunki i kolory</small>
        </button>
      </section>
    </main>
  );
}
