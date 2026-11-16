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
import { Route as PlanRoute } from "@/routes/_tabs.plan";
import { useAuth } from "@/lib/loadwise/auth";
import { GymEvidenceProvider } from "@/lib/loadwise/useGymEvidence";
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
function AuditShell() {
  const { user } = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const content = (
    <div className="app-shell" data-session-audit-path={pathname}>
      <Outlet />
    </div>
  );
  return query.get("kind") === "planning" ? (
    <GymEvidenceProvider ownerId={user?.id} ready>
      {content}
    </GymEvidenceProvider>
  ) : (
    content
  );
}
const root = createRootRoute({
  component: AuditShell,
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
/** An isolated sheet launcher; the production plan currently opens a full route. */
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
const query = new URLSearchParams(location.search);
const pageFlow = query.get("page") === "1";
const week = createRoute({
  getParentRoute: () => root,
  path: "/plan",
  component: pageFlow ? (PlanRoute.options.component as any) : WeekStandIn,
  validateSearch: parseSessionSheetSearch,
});
const startAt = pageFlow || query.get("unit") === "1" ? "/plan" : "/sesja/2026-11-02?slot=1";
const router = createRouter({
  routeTree: root.addChildren([route, progress, week]),
  history: createMemoryHistory({ initialEntries: [startAt] }),
});
Object.assign(window, { __auditRouter: router });
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
