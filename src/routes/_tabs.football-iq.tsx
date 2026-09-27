import { createFileRoute } from "@tanstack/react-router";
import { FootballIQMatch } from "../features/football-iq-match";

export const Route = createFileRoute("/_tabs/football-iq")({
  component: FootballIQRoute,
});

function FootballIQRoute() {
  return (
    <FootballIQMatch
      showOnboardingInitially
      onBack={() => window.history.back()}
    />
  );
}
