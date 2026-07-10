import { createFileRoute, redirect } from "@tanstack/react-router";

// Frame Analyzer nie jest już ścieżką zawodnika. Analiza klatkowa jest
// narzędziem trenera/admina i dostępna tylko z Coach Review Queue.
export const Route = createFileRoute("/vision-lab/frame-analyzer/$testId")({
  beforeLoad: () => {
    throw redirect({ to: "/vision-lab" });
  },
});
