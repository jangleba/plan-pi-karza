import { useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";
import { useLoadwise } from "@/lib/loadwise/store";
import { selectEffectivePlan, selectPlanWeeks } from "@/lib/loadwise/effectivePlanSelector";
import { scheduleRouteWarmup } from "@/lib/routeWarmup";

const common = ["/start", "/plan", "/fuel", "/postep", "/football-iq"] as const;

export function AppRouteWarmup() {
  const router = useRouter();
  const { state } = useLoadwise();
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    // Do not restart the idle queue on every tab change or prefetch the large session/profile tools.
    const targets = common.filter((target) => target !== router.state.location.pathname);
    return scheduleRouteWarmup(targets, async (to) => {
      if (to !== router.state.location.pathname) await router.preloadRoute({ to });
      if (to === "/plan") {
        const snapshot = latest.current;
        const plan = selectEffectivePlan(snapshot.plan, snapshot.modifications, {
          profile: snapshot.profile,
          readiness: snapshot.readiness,
          completions: snapshot.completions,
        });
        selectPlanWeeks(plan, snapshot.profile);
      }
    });
  }, [router]);
  return null;
}
