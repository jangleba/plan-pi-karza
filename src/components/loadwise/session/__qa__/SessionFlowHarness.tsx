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
const router = createRouter({
  routeTree: root.addChildren([route, progress]),
  history: createMemoryHistory({ initialEntries: ["/sesja/2026-11-02?slot=1"] }),
});
Object.assign(window, { __auditRouter: router });
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
