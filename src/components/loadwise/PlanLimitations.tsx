import type { Issue } from "@/lib/loadwise/engineV2/model";
import { groupPlanIssues } from "@/lib/loadwise/planIssues";
import { plDate } from "./PlanWeek";

/** Limitations of the plan, grouped by cause with the affected days and the right action. */
export function PlanLimitations({ issues }: { issues: readonly Issue[] }) {
  const groups = groupPlanIssues(issues);
  if (!groups.length) return null;
  return (
    <section className="bw-plan-card" aria-label="Ograniczenia planu">
      <h3 className="bw-plan-settings-title">
        Ograniczenia planu · {groups.reduce((n, group) => n + group.count, 0)}
      </h3>
      <ul className="bw-plan-limits">
        {groups.map((group) => (
          <li key={group.key} data-cause={group.key}>
            <h4>{group.title}</h4>
            <p>{group.explanation}</p>
            {(group.targets.length > 0 || group.dates.length > 0) && (
              <p className="bw-plan-limits-touched">
                <strong>Dotyczy:</strong>{" "}
                {[
                  group.targets.join(", "),
                  group.dates.length
                    ? group.dates
                        .slice(0, 6)
                        .map((date) => plDate(date))
                        .join(", ") +
                      (group.dates.length > 6 ? ` i ${group.dates.length - 6} inne` : "")
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            <p className="bw-plan-limits-action">
              <strong>Co zrobić:</strong> {group.action}
            </p>
            <details className="bw-plan-disclosure">
              <summary>Szczegóły ({group.messages.length})</summary>
              <ul className="bw-plan-bullets">
                {group.messages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
