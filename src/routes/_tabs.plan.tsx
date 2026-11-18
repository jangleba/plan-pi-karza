import { createFileRoute } from "@tanstack/react-router";
import { PlanScreen } from "@/components/loadwise/TrainingPlanScreen";

/**
 * `?aktualizuj=1` opens the preview of an updated plan (from a session that needs it);
 * `?ustawienia=1` opens the plan settings (from Profile). The plan screen itself shows only the week.
 */
export const Route = createFileRoute("/_tabs/plan")({
  validateSearch: (search: Record<string, unknown>): { aktualizuj?: "1"; ustawienia?: "1" } => ({
    ...(search.aktualizuj === "1" || search.aktualizuj === 1 ? { aktualizuj: "1" as const } : {}),
    ...(search.ustawienia === "1" || search.ustawienia === 1 ? { ustawienia: "1" as const } : {}),
  }),
  component: PlanRoute,
});

function PlanRoute() {
  const { aktualizuj, ustawienia } = Route.useSearch();
  return <PlanScreen autoUpdate={aktualizuj === "1"} openSettings={ustawienia === "1"} />;
}
