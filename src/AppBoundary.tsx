import { Component, type ReactNode } from "react";
import { scoped } from "./lib/store";

/** Ekran na czas ładowania: zamiast pustej, białej planszy widać logo (tymczasowe: B w piłce). */
export function Splash() {
  return (
    <main className="bw-grad-soft flex h-[100dvh] items-center justify-center" aria-busy="true" aria-label="Ładowanie">
      <svg viewBox="0 0 24 24" className="bw-bounce h-12 w-12" aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill="var(--color-accent)" stroke="var(--color-card)" strokeWidth="2" />
        <text x="12" y="12" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="700" fill="#fff" style={{ fontFamily: "inherit" }}>B</text>
      </svg>
    </main>
  );
}

/** Błąd ładowania fragmentu kodu po nowej wersji aplikacji albo po przerwie w sieci: pomaga jedno odświeżenie. */
const CHUNK_ERROR = /dynamically imported module|Loading chunk|Importing a module script failed|error loading dynamically/i;
const RELOAD_KEY = "boundaryReloadAt";

/** Jedno automatyczne odświeżenie na 30 s (żeby nie zapętlić się przy trwałym błędzie). */
function reloadOnce(): void {
  const last = Number(scoped.getItem(RELOAD_KEY) ?? 0);
  if (Date.now() - last < 30_000) return;
  scoped.setItem(RELOAD_KEY, String(Date.now()));
  location.reload();
}

/** Komunikat zamiast białego ekranu. Dane na urządzeniu nie są ruszane (onboarding zapamiętuje postęp). */
export function ErrorCard({ error }: { error?: unknown }) {
  const msg = error instanceof Error ? error.message : "";
  return (
    <main className="bw-grad-soft mx-auto flex h-[100dvh] max-w-md flex-col items-center justify-center px-8 text-center text-ink" role="alert">
      <h1 className="text-2xl font-semibold tracking-tight">Coś poszło nie tak</h1>
      <p className="mt-2 text-sm text-muted">Twoje dane są bezpieczne. Odśwież aplikację, a wrócisz do miejsca, w którym przerwano.</p>
      {msg && <p className="mt-3 max-w-full break-words text-xs text-muted/70">{msg.slice(0, 160)}</p>}
      <button onClick={() => location.reload()} className="bw-grad mt-6 w-full rounded-2xl py-4 text-base font-medium shadow-sm">Odśwież aplikację</button>
    </main>
  );
}

export class AppBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) { return { error }; }
  componentDidCatch(error: unknown) {
    console.error("[Ballwise] błąd renderowania", error);
    if (error instanceof Error && CHUNK_ERROR.test(error.message)) reloadOnce();
  }
  render() { return this.state.error ? <ErrorCard error={this.state.error} /> : this.props.children; }
}
