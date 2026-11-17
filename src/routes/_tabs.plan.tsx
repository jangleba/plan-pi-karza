import { createFileRoute } from "@tanstack/react-router";
import { PlanScreen } from "@/components/loadwise/TrainingPlanScreen";

/** `?aktualizuj=1` opens the preview of an updated plan (from a session that needs it). */
export const Route = createFileRoute("/_tabs/plan")({
  validateSearch: (search: Record<string, unknown>): { aktualizuj?: "1" } =>
    search.aktualizuj === "1" || search.aktualizuj === 1 ? { aktualizuj: "1" } : {},
  component: PlanRoute,
});

function PlanRoute() {
  const { aktualizuj } = Route.useSearch();
  return <PlanScreen autoUpdate={aktualizuj === "1"} />;
}
