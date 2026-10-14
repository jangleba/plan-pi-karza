import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/loadwise/auth";
import { useLoadwise } from "@/lib/loadwise/store";
import { AppLaunchScreen } from "@/components/loadwise/AppLaunchScreen";
import { AppDataError } from "@/components/loadwise/AppDataError";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  const { hydrated, hydrationError, state } = useLoadwise();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    if (!hydrated || hydrationError) return;
    if (state.profile?.onboardingComplete) {
      navigate({ to: "/start", replace: true });
    } else {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [loading, user, hydrated, state.profile?.onboardingComplete, hydrationError, navigate]);

  if (hydrationError && user && !state.profile?.onboardingComplete) return <AppDataError />;
  return <AppLaunchScreen />;
}
