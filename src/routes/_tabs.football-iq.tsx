import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FootballIQMatch } from "../features/football-iq-match";

export const Route = createFileRoute("/_tabs/football-iq")({
  component: FootballIQRoute,
});

function FootballIQRoute() {
  const navigate = useNavigate();
  return (
    <FootballIQMatch
      showOnboardingInitially
      onBack={() => navigate({ to: "/start" })}
    />
  );
}
