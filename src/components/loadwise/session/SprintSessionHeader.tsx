import { SurfaceSketch } from "@/components/design/SurfaceSketch";
import { Activity, Clock3, SignalHigh } from "lucide-react";
import type { SessionDay } from "@/lib/loadwise/types";
import { formatDateFull, professionalSessionTitle } from "@/lib/loadwise/labels";
import "./sprint-design.css";

function matchLabel(value: string | null | undefined) {
  const before = /^MD-(\d+)$/i.exec(value ?? "");
  if (before) {
    const days = Number(before[1]);
    return days === 0 ? "Dzień meczu" : days === 1 ? "1 dzień do meczu" : days + " dni do meczu";
  }
  const after = /^MD\+(\d+)$/i.exec(value ?? "");
  if (after) return after[1] === "1" ? "1 dzień po meczu" : after[1] + " dni po meczu";
  return value || null;
}

function sessionSummary(session: SessionDay): [string, string] {
  const text = [session.title, session.sessionType, session.goalLabel].join(" ");
  if (/maksymaln|lotny|max.velocity|flying/i.test(text))
    return ["Szybkie odcinki.", "Pełny odpoczynek między seriami."];
  if (/przyspiesz|accel|start/i.test(text))
    return ["Krótki start, mocne przyspieszenie.", "Pełny odpoczynek między seriami."];
  if (/hamow|zwrot|change.of.direction|COD/i.test(text))
    return ["Hamowanie i zmiana kierunku.", "Kontrola ruchu w każdym powtórzeniu."];
  return ["Technika, rytm i kontrola ruchu.", "Odpoczynek zgodnie z planem."];
}

export function SprintSessionHeader({
  session,
  onBack,
}: {
  session: SessionDay;
  onBack: () => void;
}) {
  const label = matchLabel(session.mdLabel ?? session.mdRelation);
  const rawTitle = professionalSessionTitle(session.title).replace(/^sprint\s*:\s*/i, "");
  const title = rawTitle.charAt(0).toLocaleUpperCase("pl") + rawTitle.slice(1);
  const summary = sessionSummary(session);
  const date = formatDateFull(session.date);
  const intensity =
    session.intensity.charAt(0).toLocaleUpperCase("pl") + session.intensity.slice(1);
  return (
    <header className="bw-training-header">
      <div className="bw-training-brandbar">
        <button
          type="button"
          className="bw-training-brand"
          aria-label="Wróć do planu"
          title="Wróć do planu"
          onClick={onBack}
        >
          <span className="bw-training-logo">
            <Activity aria-hidden="true" />
          </span>
          <span>ballwise</span>
        </button>
        <span className="bw-training-section-label">Trening</span>
      </div>
      <div className="bw-training-date">
        <span>{date.charAt(0).toLocaleUpperCase("pl") + date.slice(1)}</span>
        {label && <span>{label}</span>}
      </div>
      <div className="bw-training-hero bw-sketch-surface">
        <SurfaceSketch kind="track" />
        <p className="bw-training-kicker">Sprint</p>
        <h1>{title}</h1>
        <p className="bw-training-summary">
          {summary[0]}
          <br />
          {summary[1]}
        </p>
        <div className="bw-training-meta">
          <span>
            <Clock3 aria-hidden="true" />
            {session.durationMin} min
          </span>
          <span>
            <SignalHigh aria-hidden="true" />
            {intensity} intensywność
          </span>
        </div>
      </div>
    </header>
  );
}
