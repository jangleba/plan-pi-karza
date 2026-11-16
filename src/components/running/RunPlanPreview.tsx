import type { SessionDay } from "@/lib/loadwise/types";
import { deriveRunningIntervalProtocol } from "@/lib/running/intervals";
import { durationLabel } from "./runGuideText";
import { runningPreviewRows } from "./runPlanPresentation";
import { RunCourseSetup } from "./RunCourseSetup";
import "./run-tools.css";

/** The plan and the clock read the same protocol; no distances are inferred from time. */
export function RunPlanPreview({ session }: { session: SessionDay }) {
  const protocol = deriveRunningIntervalProtocol(session);
  if (!protocol?.steps.length) return null;
  const rows = runningPreviewRows(protocol);
  const totalSeconds = protocol.steps.every((step) => step.target.mode === "time")
    ? protocol.steps.reduce((sum, step) => sum + (step.target.value ?? 0), 0)
    : null;
  return (
    <section className="bw-rplan-group bw-run-preview" aria-label="Plan biegu">
      <h3>
        Plan biegu
        {totalSeconds ? <small>{durationLabel(totalSeconds)}</small> : null}
      </h3>
      <ul className="bw-rplan-card">
        {rows.map((row) => (
          <li
            key={row.id}
            className="bw-run-plan-row"
            data-tone={row.tone}
            data-rest={row.tone === "warning" ? "" : undefined}
          >
            <span className="bw-run-plan-kind">{row.kind}</span>
            <span className="bw-run-plan-text">
              <strong>{row.title}</strong>
              {row.details.map((detail) => (
                <small key={detail}>{detail}</small>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <RunCourseSetup session={session} />
    </section>
  );
}
