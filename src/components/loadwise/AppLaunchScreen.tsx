export function AppLaunchScreen() {
  return (
    <div
      className="app-shell min-h-screen overflow-hidden bg-background"
      aria-busy="true"
      aria-label="Ładowanie aplikacji BallWise"
    >
      <div className="mx-auto w-full max-w-md px-5 pt-[calc(1.25rem+env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[1.65rem] font-semibold tracking-[-0.045em] text-foreground">
              BallWise
            </div>
            <div className="mt-1 h-3 w-28 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
        </div>

        <div className="mt-8 h-36 animate-pulse rounded-[1.75rem] border border-border/70 bg-card shadow-sm" />

        <div className="mt-7 flex items-center justify-between">
          <div className="h-5 w-32 animate-pulse rounded-full bg-muted" />
          <div className="h-4 w-14 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="mt-4 space-y-3">
          <div className="h-24 animate-pulse rounded-[1.5rem] border border-border/70 bg-card" />
          <div className="h-24 animate-pulse rounded-[1.5rem] border border-border/70 bg-card" />
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-border/70 bg-background/95 px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-md justify-between">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex w-12 flex-col items-center gap-2">
              <div className="h-6 w-6 animate-pulse rounded-lg bg-muted" />
              <div className="h-2 w-9 animate-pulse rounded-full bg-muted" />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Ładowanie…</span>
    </div>
  );
}
