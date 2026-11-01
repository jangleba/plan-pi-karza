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
import { tacticalGroup } from "../tacticalJourney";
import { makeJourneyDraft } from "../journeyHistory";
import type { JourneySession } from "../journeyTypes";
import "@/styles.css";
import "@/styles/ballwise-visual-system.css";
const query = new URLSearchParams(location.search);
if (query.get("fixture") === "partner") {
  const base = createJourney(advancedJourneyBank[0]);
  const partial = chooseJourney(base, "t:pass:support:ground", 2);
  if (partial.outcome || partial.world.carrierId === "you")
    throw new Error("Partner QA fixture no longer provides a takeover");
  localStorage.setItem(
    "ballwise:iq:journeys:v1:iq-browser-qa:draft",
    JSON.stringify(makeJourneyDraft(partial, "learn", "qa-partner")),
  );
}
function complete(s: JourneySession): JourneySession | null {
  while (!s.outcome) {
    const choices = journeyStep(s).choices;
    const c =
      choices.find((c) => c.quality === "good" && c.intent !== "shoot" && !c.timing) ??
      choices.find((c) => c.quality === "possible") ??
      choices[0];
    s = chooseJourney(s, c.id, 2, false);
  }
  return s;
}
Object.assign(window, {
  __iqQA: {
    plan: (id: string) => {
      const definition = advancedJourneyBank.find((d) => d.id === id)!;
      const final = complete(createJourney(definition))!;
      let s = createJourney(definition);
      return final.decisions.map((d) => {
        const c = journeyChoice(s, d.choiceId)!;
        const result = {
          id: d.choiceId,
          group: `${tacticalGroup(c)}:${c.timing ?? "now"}`,
          delivery: c.delivery ? deliveryLabels[c.delivery] : null,
        };
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
    <FootballIQJourney
      position={query.get("position") ?? "forward"}
      historyOwner="iq-browser-qa"
      initialScenario={query.get("fixture") === "partner" ? 0 : undefined}
    />
  ),
});
const router = createRouter({
  routeTree: route.addChildren([iq]),
  history: createMemoryHistory({ initialEntries: ["/football-iq"] }),
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
