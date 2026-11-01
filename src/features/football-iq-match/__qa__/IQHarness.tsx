/** Standalone browser QA: real 3D assets and isolated local progress; no account or API. */
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  createMemoryHistory,
  Outlet,
} from "@tanstack/react-router";
import { FootballIQJourney } from "../FootballIQJourney";
import { BottomNav } from "@/components/loadwise/BottomNav";
import { advancedJourneyBank } from "../advancedJourneyBank";
import { chooseJourney, createJourney, journeyChoice, journeyStep } from "../journeyEngine";
import { deliveryLabels } from "../ballFlight";
import type { JourneySession } from "../journeyTypes";
import "@/styles.css";
import "@/styles/ballwise-visual-system.css";
const query = new URLSearchParams(location.search);
function complete(s: JourneySession): JourneySession | null {
  if (s.outcome)
    return s.step === 6 && !s.transition && !["loss", "blocked"].includes(s.outcome) ? s : null;
  for (const c of [...journeyStep(s).choices].sort(
    (a, b) => Number(a.quality !== "good") - Number(b.quality !== "good"),
  )) {
    if (c.quality === "error") continue;
    const result = complete(chooseJourney(s, c.id, 2, false));
    if (result) return result;
  }
  return null;
}
Object.assign(window, {
  __iqQA: {
    plan: (id: string) => {
      const definition = advancedJourneyBank.find((d) => d.id === id)!;
      const final = complete(createJourney(definition))!;
      let s = createJourney(definition);
      return final.decisions.map((d) => {
        const c = journeyChoice(s, d.choiceId)!;
        const result = { id: d.choiceId, delivery: c.delivery ? deliveryLabels[c.delivery] : null };
        s = chooseJourney(s, d.choiceId, 2, false);
        return result;
      });
    },
  },
});
const route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <BottomNav />
    </>
  ),
});
const iq = createRoute({
  getParentRoute: () => route,
  path: "/football-iq",
  component: () => (
    <FootballIQJourney position={query.get("position") ?? "forward"} historyOwner="iq-browser-qa" />
  ),
});
const router = createRouter({
  routeTree: route.addChildren([iq]),
  history: createMemoryHistory({ initialEntries: ["/football-iq"] }),
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
