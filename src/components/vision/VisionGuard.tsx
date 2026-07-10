import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/loadwise/auth";

/** Chroni trasy Vision Lab — wymaga zalogowania. */
export function VisionGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Ładowanie…</p>
      </div>
    );
  }
  return <div className="app-shell">{children}</div>;
}
