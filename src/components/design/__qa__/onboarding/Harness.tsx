import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  Outlet,
  RouterProvider,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { Route as OnboardingRoute } from "@/routes/onboarding";
import { useLoadwise } from "./Store";
import "@/styles.css";
import "@/styles/ballwise-visual-system.css";
OnboardingRoute.useSearch = (() => ({ edit: true })) as typeof OnboardingRoute.useSearch;
function Plan() {
  const { state } = useLoadwise();
  const navigate = useNavigate();
  const incomplete = state.profile?.onboardingComplete !== true;
  // Like the app tabs: an unsaved profile goes back to the form.
  useEffect(() => {
    if (incomplete) navigate({ to: "/onboarding", replace: true });
  }, [incomplete, navigate]);
  return (
    <main className="p-6">
      <h1>Profil zapisany</h1>
      <p data-testid="profile-saved">{state.profile?.serverProfileUpdatedAt}</p>
    </main>
  );
}
const root = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <Toaster position="top-center" />
    </>
  ),
});
const route = createRoute({
  getParentRoute: () => root,
  path: "/onboarding",
  component: OnboardingRoute.options.component,
});
const plan = createRoute({ getParentRoute: () => root, path: "/plan", component: Plan });
const profile = createRoute({ getParentRoute: () => root, path: "/profil", component: Plan });
const start = createRoute({ getParentRoute: () => root, path: "/start", component: Plan });
const router = createRouter({
  routeTree: root.addChildren([route, plan, profile, start]),
  history: createMemoryHistory({ initialEntries: ["/onboarding"] }),
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
