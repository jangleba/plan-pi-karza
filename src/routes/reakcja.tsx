import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ReactiveTrainer } from "@/components/reactive/ReactiveTrainer";
import { useAuth } from "@/lib/loadwise/auth";
import { AppLaunchScreen } from "@/components/loadwise/AppLaunchScreen";

export const Route = createFileRoute("/reakcja")({
  component: ReactiveTrainingRoute,
});

function ReactiveTrainingRoute() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, navigate, user]);

  if (loading || !user) {
    return <AppLaunchScreen />;
  }

  return (
    <ReactiveTrainer
      storageKey={`ballwise:reactive:v1:${user.id}`}
      onBack={() => navigate({ to: "/plan" })}
    />
  );
}
