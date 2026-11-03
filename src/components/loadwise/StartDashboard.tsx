import type { ReactNode } from "react";
import { CalendarDays, Check, Move, ScanLine, Activity } from "lucide-react";
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
  wellnessEnabled,
  wellnessComplete,
  busy,
  checkinDetail,
  onCheckin,
  onWellness,
  onPlan,
  onLab,
  onReaction,
  onOpen,
  onPrepare,
  onPrepareLab,
  onPrepareReaction,
}: {
  name: string;
  avatar: ReactNode;
  plan: SessionDay[];
  completions: Record<string, SessionCompletion>;
  todayIso: string;
  checkinComplete: boolean;
  wellnessEnabled: boolean;
  wellnessComplete: boolean;
  busy: boolean;
  checkinDetail: string;
  onCheckin: () => void;
  onWellness: () => void;
  onPlan: () => void;
  onLab: () => void;
  onReaction: () => void;
  onOpen: (date: string, slot: 1 | 2) => void;
  onPrepare: (date: string, slot: 1 | 2) => void;
  onPrepareLab?: () => void;
  onPrepareReaction?: () => void;
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
      <section
        className={`bw-home-checks ${wellnessEnabled ? "" : "is-single"}`}
        aria-label="Dzisiejsze ustawienia"
      >
        <button onClick={onCheckin} disabled={busy} title={checkinDetail}>
          <Check size={18} />
          <span>
            <strong>Plan na dziś</strong>
            <small>{checkinComplete ? "Potwierdzony · zmień" : "Sprawdź lub zmień"}</small>
          </span>
        </button>
        {wellnessEnabled && (
          <button onClick={onWellness}>
            <Activity size={18} />
            <span>
              <strong>Samopoczucie</strong>
              <small>{wellnessComplete ? "Zapisane · zmień" : "Dodaj ocenę"}</small>
            </span>
          </button>
        )}
      </section>
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
