import { useEffect, useRef, useState } from "react";
import { useLoadwise } from "@/lib/loadwise/store";
import { selectEffectivePlan } from "@/lib/loadwise/effectivePlanSelector";
import {
  decideReadinessAdjustment,
  READINESS_ADJUSTMENT_REASON,
} from "@/lib/loadwise/todayReadinessAdjustment";
import { adjustedForReadiness } from "@/lib/loadwise/engineV2/planStatus";
import "./today-session-choice.css";

/**
 * After a saved check-in this recalculates today's unstarted session by the existing readiness
 * policy and shows what changed and why. Without a check-in it does nothing: the full session
 * stays. The change is a stored overlay of today only, so it survives a refresh and the runner
 * reads the lighter dose from it.
 */
export function ReadinessAdjustmentCard({ todayIso }: { todayIso: string }) {
  const { state, applyModification, undoModification } = useLoadwise();
  const [error, setError] = useState<string | null>(null);
  const flight = useRef(false);
  /** One attempt per distinct situation, so a refusal or a stale store never loops. */
  const attempted = useRef<string | null>(null);
  const profile = state.profile;
  const readiness = state.readiness[todayIso];
  const modifications = state.modifications[todayIso] ?? [];
  const plan = profile
    ? selectEffectivePlan(state.plan, state.modifications, { completions: state.completions })
    : [];
  const decision = profile
    ? decideReadinessAdjustment({
        profile,
        plan,
        completions: state.completions,
        readiness,
        modifications,
        date: todayIso,
      })
    : ({ kind: "none" } as const);
  const signature = JSON.stringify([
    decision.kind,
    readiness,
    "kind" in decision && decision.kind === "adjust" ? decision.session.durationMin : null,
  ]);

  useEffect(() => {
    if (flight.current || attempted.current === signature) return;
    if (decision.kind !== "adjust" && decision.kind !== "restore") return;
    flight.current = true;
    attempted.current = signature;
    const run =
      decision.kind === "adjust"
        ? applyModification(
            todayIso,
            "swap",
            decision.day,
            decision.original,
            `${READINESS_ADJUSTMENT_REASON} Dostosowano do check-inu: ${decision.session.readinessAdjustment?.reason ?? ""}`,
          )
        : undoModification(todayIso, decision.modificationId);
    run
      .then(() => setError(null))
      .catch((reason: unknown) => {
        setError(
          reason instanceof Error
            ? reason.message
            : "Nie udało się dostosować dzisiejszego treningu.",
        );
      })
      .finally(() => {
        flight.current = false;
      });
  });

  const day = plan.find((item) => item.date === todayIso);
  const adjusted = [day, day?.secondSession].find(
    (session) => session && readiness && adjustedForReadiness(session, readiness),
  );
  const info = adjusted?.readinessAdjustment;
  if (!info && decision.kind !== "unavailable" && !error) return null;
  return (
    <section className="bw-today-choice bw-readiness-adjusted" aria-label="Trening po check-inie">
      {info ? (
        <>
          <strong>Trening dostosowany do check-inu</strong>
          <p>
            {info.reason} {info.beforeMinutes} → {info.afterMinutes} min. Rozgrzewka, kolejność
            pracy i przerwy zostają.
          </p>
          {info.changes.length > 0 ? (
            <ul>
              {info.changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
      {decision.kind === "unavailable" ? <p role="status">{decision.reason}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
