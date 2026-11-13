import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/loadwise/ui";
import { PlanComingSoon } from "@/components/loadwise/PlanComingSoon";
import "@/styles/ballwise-plan.css";

export const Route = createFileRoute("/_tabs/plan")({
  component: PlanScreen,
});

/** The week-planning engine was removed; this tab waits for the new one. */
function PlanScreen() {
  return (
    <div className="bw-plan-screen pb-6">
      <AppHeader title="Plan" sketch="pitch" />
      <PlanComingSoon />
    </div>
  );
}
