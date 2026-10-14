import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { FuelWorkspace } from "@/components/fuel/FuelWorkspace";
import { planFuelContexts } from "@/lib/fuel/experience";
import { useAuth } from "@/lib/loadwise/auth";
import { resolveEffectivePlan } from "@/lib/loadwise/effectivePlan";
import { useLoadwise } from "@/lib/loadwise/store";
import "@/styles/fuel-v3.css";
import "@/styles/fuel-v4.css";

export const Route = createFileRoute("/_tabs/fuel")({
  component: FuelScreen,
  head: () => ({
    meta: [
      { title: "Fuel — co zjeść teraz | BallWise" },
      {
        name: "description",
        content:
          "Wybierz czas do treningu, prosty zestaw lub zamiennik. Zapisz produkty, których nie chcesz.",
      },
    ],
  }),
});
function FuelScreen() {
  const { user } = useAuth();
  const { state, todayIso } = useLoadwise();
  const effectivePlan = useMemo(
    () => resolveEffectivePlan(state.plan, state.modifications),
    [state.plan, state.modifications],
  );
  const contexts = useMemo(
    () => planFuelContexts(effectivePlan, todayIso, state.completions),
    [effectivePlan, todayIso, state.completions],
  );
  const tomorrow = new Date(`${todayIso}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  const tomorrowMatch = effectivePlan.some(
    (s) => s.date === tomorrowIso && s.dayType === "match" && !s.isUnavailable,
  );
  return (
    <FuelWorkspace
      key={user?.id ?? "guest"}
      userId={user?.id ?? "guest"}
      contexts={contexts}
      tomorrowMatch={tomorrowMatch}
    />
  );
}
