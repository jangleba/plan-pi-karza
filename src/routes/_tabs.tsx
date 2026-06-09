import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useLoadwise } from "@/lib/loadwise/store";
import { BottomNav } from "@/components/loadwise/BottomNav";

export const Route = createFileRoute("/_tabs")({
  component: TabsLayout,
});

function TabsLayout() {
  const { hydrated, state, refreshPlanIfNeeded } = useLoadwise();
  const navigate = useNavigate();

  useEffect(() => {
    if (hydrated && !state.profile?.onboardingComplete) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [hydrated, state.profile?.onboardingComplete, navigate]);

  useEffect(() => {
    if (hydrated && state.profile?.onboardingComplete) {
      refreshPlanIfNeeded();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  if (!hydrated || !state.profile?.onboardingComplete) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Ładowanie…</p>
      </div>
    );
  }

  return (
    <div className="app-shell relative min-h-screen pb-24">
      <Outlet />
      <BottomNav />
    </div>
  );
}
