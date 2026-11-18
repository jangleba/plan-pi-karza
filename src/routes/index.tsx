import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { App } from "../App";

// Aplikacja korzysta z localStorage i WebGL, więc renderujemy ją tylko w przeglądarce.
export const Route = createFileRoute("/")({
  component: () => (
    <ClientOnly fallback={null}>
      <App />
    </ClientOnly>
  ),
});
