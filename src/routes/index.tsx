import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { App } from "../App";
import { AppBoundary, ErrorCard, Splash } from "../AppBoundary";

// Aplikacja korzysta z localStorage i WebGL, więc renderujemy ją tylko w przeglądarce.
// Splash zamiast pustego ekranu na czas ładowania, a AppBoundary zamiast białej planszy po błędzie.
export const Route = createFileRoute("/")({
  component: () => (
    <ClientOnly fallback={<Splash />}>
      <AppBoundary>
        <App />
      </AppBoundary>
    </ClientOnly>
  ),
  errorComponent: ({ error }) => <ErrorCard error={error} />,
});
