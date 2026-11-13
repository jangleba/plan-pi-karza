/** Actual route-to-route navigation with authored state and isolated write receipts.
 * Does not authenticate, save to Supabase or claim to test production availability. */
import { createRoot } from "react-dom/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useParams,
  useRouterState,
} from "@tanstack/react-router";
import type { FunctionComponent } from "react";
import { Route as StartRoute } from "@/routes/_tabs.start";
import { Route as PlanRoute } from "@/routes/_tabs.plan";
import { Route as SessionRoute } from "@/routes/sesja.$date";
import { Route as FuelRoute } from "@/routes/_tabs.fuel";
import { Route as ProgressRoute } from "@/routes/_tabs.postep";
import { Route as LabRoute } from "@/routes/_tabs.lab";
import { Route as IQRoute } from "@/routes/_tabs.football-iq";
import { Route as ProfileRoute } from "@/routes/_tabs.profil";
import { BottomNav } from "@/components/loadwise/BottomNav";
import { RouteMotion } from "@/components/loadwise/RouteMotion";

function useJourneySearch() {
  return useRouterState({ select: (state) => state.location.search });
}
function useJourneyParams() {
  return useParams({ strict: false });
}
PlanRoute.useSearch = useJourneySearch as typeof PlanRoute.useSearch;
SessionRoute.useSearch = useJourneySearch as typeof SessionRoute.useSearch;
SessionRoute.useParams = useJourneyParams as typeof SessionRoute.useParams;
ProgressRoute.useSearch = useJourneySearch as typeof ProgressRoute.useSearch;
LabRoute.useSearch = useJourneySearch as typeof LabRoute.useSearch;
function Shell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <div className="app-shell" data-journey-path={pathname}>
      <RouteMotion>
        <Outlet />
      </RouteMotion>
      {!pathname.startsWith("/sesja/") && <BottomNav />}
    </div>
  );
}
const root = createRootRoute({ component: Shell });
const views = [
  ["/start", StartRoute],
  ["/plan", PlanRoute],
  ["/sesja/$date", SessionRoute],
  ["/fuel", FuelRoute],
  ["/postep", ProgressRoute],
  ["/lab", LabRoute],
  ["/football-iq", IQRoute],
  ["/profil", ProfileRoute],
] as const;
const routes = views.map(([path, route]) =>
  createRoute({
    getParentRoute: () => root,
    path,
    component: route.options.component as FunctionComponent,
    ...(route.options.validateSearch ? { validateSearch: route.options.validateSearch } : {}),
  }),
);
const router = createRouter({
  routeTree: root.addChildren(routes),
  defaultViewTransition: true,
  history: createMemoryHistory({
    initialEntries: [
      new URLSearchParams(location.search).get("legacy") === "1"
        ? "/sesja/2026-11-01"
        : (new URLSearchParams(location.search).get("path") ?? "/start"),
    ],
  }),
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
