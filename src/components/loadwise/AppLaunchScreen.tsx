import { useEffect, useState } from "react";

export function AppLaunchScreen() {
  const [showSlowLaunch, setShowSlowLaunch] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setShowSlowLaunch(true), 260);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <div
      className="app-shell grid min-h-screen place-items-center overflow-hidden bg-background"
      aria-busy="true"
      aria-label="Ładowanie aplikacji BallWise"
    >
      {showSlowLaunch && (
        <div className="flex -translate-y-6 flex-col items-center" role="status">
          <div className="text-[1.45rem] font-medium tracking-[-0.045em] text-foreground">
            BallWise
          </div>
          <div className="mt-3 h-1 w-8 overflow-hidden rounded-full bg-primary/10">
            <span className="ballwise-boot-line block h-full w-1/2 rounded-full bg-primary/60" />
          </div>
        </div>
      )}
      <span className="sr-only">Ładowanie…</span>
    </div>
  );
}
