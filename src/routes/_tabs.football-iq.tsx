import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/loadwise/auth";
import { FootballIQMatch } from "../features/football-iq-match";

export const Route = createFileRoute("/_tabs/football-iq")({
  component: FootballIQRoute,
});

function FootballIQRoute() {
  const navigate = useNavigate();
  const { user } = useAuth();
  return (
    <FootballIQMatch
      key={user?.id ?? "guest"}
      historyOwner={user?.id}
      showOnboardingInitially
      onBack={() => navigate({ to: "/start" })}
    />
  );
}
