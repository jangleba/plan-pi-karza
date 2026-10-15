import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/loadwise/auth";
import { useLoadwise } from "@/lib/loadwise/store";
import { FootballIQMatch } from "../features/football-iq-match";

export const Route = createFileRoute("/_tabs/football-iq")({
  component: FootballIQRoute,
});

function FootballIQRoute() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { state } = useLoadwise();
  return (
    <FootballIQMatch
      key={`${user?.id ?? "guest"}:${state.profile?.position ?? "unknown"}`}
      historyOwner={user?.id}
      position={state.profile?.position}
      showOnboardingInitially
      onBack={() => navigate({ to: "/start" })}
    />
  );
}
