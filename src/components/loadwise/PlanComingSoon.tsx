import { CalendarClock } from "lucide-react";

/**
 * Shown where the generated week used to be. The week-planning engine was
 * removed and will be rebuilt; profile, history and other modules keep working.
 */
export function PlanComingSoon({ compact = false }: { compact?: boolean }) {
  return (
    <section
      className={compact ? "bw-plan-soon bw-plan-soon--compact" : "bw-plan-soon"}
      role="status"
      aria-label="Plan wkrótce"
    >
      <CalendarClock size={compact ? 18 : 22} aria-hidden="true" />
      <span>
        <strong>Plan wkrótce</strong>
        <small>
          Układanie tygodnia budujemy od nowa. Profil, historia treningów i pozostałe moduły
          działają jak dotąd.
        </small>
      </span>
    </section>
  );
}
