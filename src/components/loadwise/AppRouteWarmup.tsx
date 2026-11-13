import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { scheduleRouteWarmup } from "@/lib/routeWarmup";

const common = ["/start", "/plan", "/fuel", "/postep", "/football-iq"] as const;
type Route = (typeof common)[number];
/**
 * After the tabs, while the athlete is idle: the Football IQ player model, so it
 * is not downloaded, parsed or decoded at the moment of the tap.
 */
type Extra = "iq-model";
const extras: Extra[] = ["iq-model"];

async function warmExtra() {
  const { loadRunningModel } = await import("@/features/football-iq-match/mixamo");
  await loadRunningModel();
}

export function AppRouteWarmup() {
  const router = useRouter();
  useEffect(() => {
    // Do not restart the idle queue on every tab change or prefetch the profile tools.
    const targets: (Route | Extra)[] = [
      ...common.filter((target) => target !== router.state.location.pathname),
      ...extras,
    ];
    return scheduleRouteWarmup(targets, async (to) => {
      if (to === "iq-model") return warmExtra();
      if (to !== router.state.location.pathname) await router.preloadRoute({ to });
    });
  }, [router]);
  return null;
}
