import type { SessionDay } from "@/lib/loadwise/types";
import { deriveRunningIntervalProtocol } from "@/lib/running/intervals";

/**
 * The run as a plan before the start: work and rest are named separately,
 * with the number of repetitions, their length and the pace range.
 */
export function RunPlanPreview({ session }: { session: SessionDay }) {
  const protocol = deriveRunningIntervalProtocol(session);
  if (!protocol?.steps.length) return null;
  const work = protocol.steps.filter((step) => step.kind === "work");
  const rest = protocol.steps.find((step) => step.kind === "recovery");
  const first = work[0];
  const same = work.every((step) => step.target.label === first.target.label);
  return (
    <section className="bw-rplan-group" aria-label="Plan biegu">
      <h3>
        Część główna
        <small>{protocol.summary}</small>
      </h3>
      <ul>
        {(same ? [first] : work).map((step) => (
          <li key={step.id} className="bw-run-plan-row">
            <span className="bw-run-plan-kind">Praca</span>
            <span className="bw-run-plan-text">
              <strong>
                {same && work.length > 1
                  ? `${work.length} × ${first.target.label}`
                  : work.length > 1
                    ? `Odcinek ${step.repeatIndex} z ${step.repeatTotal}: ${step.target.label}`
                    : step.target.label}
              </strong>
              {step.target.paceTarget && <small>Tempo {step.target.paceTarget.label}</small>}
              {step === first && step.instruction && <small>{step.instruction}</small>}
            </span>
          </li>
        ))}
        {rest && (
          <li className="bw-run-plan-row" data-rest="">
            <span className="bw-run-plan-kind">Przerwa</span>
            <span className="bw-run-plan-text">
              <strong>{rest.target.label}</strong>
              <small>Po każdym odcinku</small>
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}
