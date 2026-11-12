import { useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";
import { useLoadwise } from "@/lib/loadwise/store";
import { selectEffectivePlan, selectPlanWeeks } from "@/lib/loadwise/effectivePlanSelector";
import { scheduleRouteWarmup } from "@/lib/routeWarmup";

const common = ["/start", "/plan", "/fuel", "/postep", "/football-iq"] as const;
type Route = (typeof common)[number];
/**
 * After the tabs, while the athlete is idle: the training panel (the most common tap on
 * Start/Plan) and the Football IQ player model, so neither is downloaded, parsed or
 * decoded at the moment of the tap.
 */
type Extra = "session-panel" | "iq-model";
const extras: Extra[] = ["session-panel", "iq-model"];

async function warmExtra(target: Extra) {
  if (target === "session-panel") {
    const sheet = await import("@/components/loadwise/session/SessionSheet");
    sheet.prepareSessionSheet();
    return;
  }
  const { loadRunningModel } = await import("@/features/football-iq-match/mixamo");
  await loadRunningModel();
}

export function AppRouteWarmup() {
  const router = useRouter();
  const { state } = useLoadwise();
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    // Do not restart the idle queue on every tab change or prefetch the profile tools.
    const targets: (Route | Extra)[] = [
      ...common.filter((target) => target !== router.state.location.pathname),
      ...extras,
    ];
    return scheduleRouteWarmup(targets, async (to) => {
      if (to === "session-panel" || to === "iq-model") return warmExtra(to);
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
