import type { ReactNode } from "react";
import { CalendarDays, Check, Move, ScanLine, Target } from "lucide-react";
import { TodaySessionCard } from "./TodaySessionCard";
import type { SessionDay, SessionCompletion } from "@/lib/loadwise/types";
import { PageHeader } from "./PageHeader";

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
}) {
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
