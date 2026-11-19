import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { GuardianPage } from "../Guardian";

// Publiczna strona opiekuna (bez logowania i bez bramki aplikacji). Dostęp daje wyłącznie jednorazowy token z linku.
export const Route = createFileRoute("/guardian")({
  component: () => (
    <ClientOnly fallback={null}>
      <GuardianPage />
    </ClientOnly>
  ),
});
