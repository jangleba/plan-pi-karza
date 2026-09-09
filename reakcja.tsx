import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ReactiveTrainer } from "@/components/reactive/ReactiveTrainer";
import { useAuth } from "@/lib/loadwise/auth";

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
    return (
      <div className="app-shell flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Ładowanie…</p>
      </div>
    );
  }

  return (
    <ReactiveTrainer
      storageKey={`ballwise:reactive:v1:${user.id}`}
      onBack={() => navigate({ to: "/plan" })}
    />
  );
}
