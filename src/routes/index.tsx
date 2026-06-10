import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/loadwise/auth";
import { useLoadwise } from "@/lib/loadwise/store";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  const { hydrated, state } = useLoadwise();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    if (!hydrated) return;
    if (state.profile?.onboardingComplete) {
      navigate({ to: "/start", replace: true });
    } else {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [loading, user, hydrated, state.profile?.onboardingComplete, navigate]);

  return (
    <div className="app-shell flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="text-3xl font-semibold tracking-tight text-primary">
          Loadwise
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Ładowanie…</p>
      </div>
    </div>
  );
}
