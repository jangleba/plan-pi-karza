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
import { LearningJourney } from "../LearningJourney";
import { BottomNav } from "@/components/loadwise/BottomNav";
import "@/styles.css";
import "@/styles/ballwise-visual-system.css";
const query = new URLSearchParams(location.search);
document.body.dataset.iqQa = "true";
const route = createRootRoute({
  component: () => (
    <div className="app-shell relative min-h-screen" style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" }}>
      <div className="bw-route-motion"><Outlet /></div>
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
      historyOwner="iq-browser-qa"
      showOnboardingInitially={query.get("guide") === "1"}
    />
  ),
});
const router = createRouter({
  routeTree: route.addChildren([iq]),
  history: createMemoryHistory({ initialEntries: ["/football-iq"] }),
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
