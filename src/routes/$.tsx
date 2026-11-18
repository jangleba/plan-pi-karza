import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { App } from "../App";

// Każdy inny adres (np. /start, /plan ze starej wersji zapamiętane w podglądzie) pokazuje aplikację.
export const Route = createFileRoute("/$")({
  component: () => (
    <ClientOnly fallback={null}>
      <App />
    </ClientOnly>
  ),
});
