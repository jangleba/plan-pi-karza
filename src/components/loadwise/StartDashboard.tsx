import type { ReactNode } from "react";
import { Brain, CalendarDays, Move, ScanLine, Target } from "lucide-react";
import { PageHeader } from "./PageHeader";

export function StartDashboard({
  name,
  avatar,
  onPlan,
  onLab,
  onReaction,
  onPrepareLab,
  onPrepareReaction,
  iqTask,
  iqGoal,
  todayTitle,
  planStatus,
  todayComplete = false,
  onToday,
}: {
  name: string;
  todayTitle?: string;
  planStatus?: "empty" | "active" | "expired" | "stale";
  todayComplete?: boolean;
  onToday?: () => void;
  avatar: ReactNode;
  onPlan: () => void;
  onLab: () => void;
  onReaction: () => void;
  onPrepareLab?: () => void;
  onPrepareReaction?: () => void;
  /** Open "on the pitch" task from the last Football IQ action. */
  iqTask?: { text: string; onDone: () => void };
  /** The Football IQ aim the player is weakest at, from their own graded decisions. */
  iqGoal?: { label: string; percent: number; onOpen: () => void };
}) {
  const status = planStatus ?? (todayTitle ? "active" : "empty");
  const title =
    status === "expired"
      ? "Cykl zakończony"
      : status === "stale"
        ? "Plan wymaga aktualizacji"
        : status === "empty"
          ? "Przygotuj swój plan"
          : todayComplete
            ? "Dzisiejsze sesje zakończone"
            : (todayTitle ?? "Dzisiaj wolne");
  const subtitle =
    status === "expired"
      ? "Przygotuj kolejny plan na 4 tygodnie"
      : status === "stale"
        ? "Dostosuj go do aktualnego profilu"
        : status === "empty"
          ? "Siła, szybkość i wydolność dopasowane do tygodnia"
          : todayTitle && !todayComplete
            ? "Otwórz dzisiejszą sesję"
            : "Zobacz kolejne dni planu";
  const openToday = status === "active" && todayTitle && !todayComplete;
  return (
    <main className="bw-home-compact">
      <PageHeader
        brand
        title={`Cześć, ${name}`}
        actions={avatar}
        className="bw-page-header--inset"
      />
      <div className="bw-home-section-line">
        <h2>Dzisiaj</h2>
        <button onClick={onPlan}>
          <CalendarDays size={15} /> Plan
        </button>
      </div>
      <button
        type="button"
        className="bw-plan-soon bw-plan-soon--compact"
        onClick={openToday ? (onToday ?? onPlan) : onPlan}
      >
        <CalendarDays size={18} aria-hidden="true" />
        <span>
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </span>
      </button>
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
