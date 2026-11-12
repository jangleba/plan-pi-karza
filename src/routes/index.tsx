import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
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
  const router = useRouter();
  const usablePlan = !!state.profile?.onboardingComplete && state.plan.length > 0;

  // While the account data loads behind the launch screen, fetch the Start screen code in
  // parallel, so the first screen does not wait for another round of downloads afterwards.
  const signedIn = !!user;
  useEffect(() => {
    if (signedIn) void router.preloadRoute({ to: "/start" }).catch(() => undefined);
  }, [signedIn, router]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    if (!hydrated || (hydrationError && !usablePlan)) return;
    if (state.profile?.onboardingComplete) {
      navigate({ to: "/start", replace: true });
    } else {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [
    loading,
    user,
    hydrated,
    state.profile?.onboardingComplete,
    hydrationError,
    usablePlan,
    navigate,
  ]);

  if (hydrationError && user && !usablePlan) return <AppDataError />;
  return <AppLaunchScreen />;
}
