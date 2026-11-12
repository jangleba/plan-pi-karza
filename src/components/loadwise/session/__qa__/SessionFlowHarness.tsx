/* eslint-disable @typescript-eslint/no-explicit-any */
import { createRoot } from "react-dom/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
  useParams,
  useRouterState,
} from "@tanstack/react-router";
import { Route as SessionRoute } from "@/routes/sesja.$date";
import { Route as ProgressRoute } from "@/routes/_tabs.postep";
import {
  parseSessionSheetSearch,
  SessionSheet,
  useSessionSheet,
} from "@/components/loadwise/session/SessionSheet";
import "@/styles.css";
import "@/styles/ballwise-visual-system.css";
ProgressRoute.useSearch = (() => useRouterState({ select: (s) => s.location.search })) as any;
SessionRoute.useSearch = (() => useRouterState({ select: (s) => s.location.search })) as any;
SessionRoute.useParams = (() => useParams({ strict: false })) as any;
const root = createRootRoute({
  component: () => (
    <div className="app-shell">
      <Outlet />
    </div>
  ),
});
const route = createRoute({
  getParentRoute: () => root,
  path: "/sesja/$date",
  component: SessionRoute.options.component as any,
  validateSearch: SessionRoute.options.validateSearch,
});
const progress = createRoute({
  getParentRoute: () => root,
  path: "/postep",
  component: ProgressRoute.options.component as any,
});
/** The week list stand-in: one row that opens the training panel like the plan does. */
function WeekStandIn() {
  const search = useRouterState({ select: (s) => s.location.search }) as Record<string, unknown>;
  const unit = useSessionSheet(parseSessionSheetSearch(search));
  return (
    <main className="bw-plan-screen" style={{ padding: 16 }}>
      <h1>Plan</h1>
      <button
        type="button"
        className="bw-qa-open-unit"
        style={{ minHeight: 56, width: "100%" }}
        onClick={() => unit.open({ date: "2026-11-02", slot: 1 })}
      >
        Otwórz jednostkę
      </button>
      <SessionSheet target={unit.target} onClose={unit.close} onSelect={unit.select} />
    </main>
  );
}
const week = createRoute({
  getParentRoute: () => root,
  path: "/plan",
  component: WeekStandIn,
  validateSearch: parseSessionSheetSearch,
});
const startAt =
  new URLSearchParams(location.search).get("unit") === "1" ? "/plan" : "/sesja/2026-11-02?slot=1";
const router = createRouter({
  routeTree: root.addChildren([route, progress, week]),
  history: createMemoryHistory({ initialEntries: [startAt] }),
});
Object.assign(window, { __auditRouter: router });
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
