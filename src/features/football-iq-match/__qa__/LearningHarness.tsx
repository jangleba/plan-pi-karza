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
import { advancedJourneyBank } from "../advancedJourneyBank";
import { createJourneyForRules, chooseJourney } from "../journeyEngine";
import { makeJourneyDraft } from "../journeyHistory";
import { LearningJourney } from "../LearningJourney";
import { BottomNav } from "@/components/loadwise/BottomNav";
import "@/styles.css";
import "@/styles/ballwise-visual-system.css";
const query = new URLSearchParams(location.search);
document.body.dataset.iqQa = "true";
if (query.get("fixture") === "finish") {
  let s = createJourneyForRules(
    advancedJourneyBank.find((d) => d.id === "iqx-wing-0-0")!,
    9,
  );
  for (const id of [
    "attack9:support:pass:ground:now:18.00:75.00:you",
    "attack9:third:carry:ground:now:74.90:47.26:space",
    "attack9:third:carry:ground:now:84.27:29.31:space",
  ])
    s = chooseJourney(s, id, 1);
  localStorage.setItem(
    "ballwise:iq:journeys:v1:iq-browser-qa:draft",
    JSON.stringify(makeJourneyDraft(s, "learn", "qa63-goal")),
  );
}
const route = createRootRoute({
  component: () => (
    <div
      className="app-shell relative min-h-screen"
      style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" }}
    >
      <div className="bw-route-motion">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  ),
});
const iq = createRoute({
  getParentRoute: () => route,
  path: "/football-iq",
  component: () => (
    <LearningJourney
      position={query.get("position") ?? "forward"}
      initialScenario={
        query.has("scenario") ? Number(query.get("scenario")) : undefined
      }
      historyOwner="iq-browser-qa"
      showOnboardingInitially={query.get("guide") === "1"}
    />
  ),
});
const router = createRouter({
  routeTree: route.addChildren([iq]),
  history: createMemoryHistory({ initialEntries: ["/football-iq"] }),
});
createRoot(document.getElementById("root")!).render(
  <RouterProvider router={router} />,
);
