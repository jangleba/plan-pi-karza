import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/loadwise/auth";
import { BottomNav } from "@/components/loadwise/BottomNav";

/**
 * Chroni trasy Vision Lab — wymaga zalogowania.
 * `withNav` podłącza ten sam globalny dolny pasek nawigacji co pozostałe
 * główne ekrany aplikacji (bez tworzenia osobnej imitacji paska).
 */
export function VisionGuard({
  children,
  withNav = false,
}: {
  children: ReactNode;
  withNav?: boolean;
}) {
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

  if (!withNav) return <div className="app-shell">{children}</div>;

  return (
    <div
      className="app-shell relative min-h-screen"
      style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}
    >
      {children}
      <BottomNav />
    </div>
  );
}
