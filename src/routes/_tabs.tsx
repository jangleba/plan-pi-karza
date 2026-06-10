import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/loadwise/auth";
import { useLoadwise } from "@/lib/loadwise/store";
import { BottomNav } from "@/components/loadwise/BottomNav";

export const Route = createFileRoute("/_tabs")({
  component: TabsLayout,
});

function TabsLayout() {
  const { user, loading } = useAuth();
  const { hydrated, state, refreshPlanIfNeeded } = useLoadwise();
  const navigate = useNavigate();

  // Protect: must be signed in.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth", replace: true });
    }
  }, [loading, user, navigate]);

  // Redirect to onboarding if profile is incomplete.
  useEffect(() => {
    if (loading || !user || !hydrated) return;
    if (!state.profile?.onboardingComplete) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [loading, user, hydrated, state.profile?.onboardingComplete, navigate]);

  useEffect(() => {
    if (hydrated && state.profile?.onboardingComplete) {
      refreshPlanIfNeeded();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  if (loading || !user || !hydrated || !state.profile?.onboardingComplete) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Ładowanie…</p>
      </div>
    );
  }

  return (
    <div
      className="app-shell relative min-h-screen"
      style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}
    >
      <Outlet />
      <BottomNav />
    </div>
  );
}
