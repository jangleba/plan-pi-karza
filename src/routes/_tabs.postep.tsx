import { createFileRoute } from "@tanstack/react-router";
import { useLoadwise } from "@/lib/loadwise/store";
import { useAuth } from "@/lib/loadwise/auth";
import { ProgressWorkspace } from "@/components/progress/ProgressWorkspace";

export const Route = createFileRoute("/_tabs/postep")({
  validateSearch: (s: Record<string, unknown>): { view?: "history"; session?: string } => ({
    view: s.view === "history" ? ("history" as const) : undefined,
    session: typeof s.session === "string" ? s.session : undefined,
  }),
  component: ProgressScreen,
  head: () => ({
    meta: [
      { title: "Postęp i historia treningów | BallWise" },
      {
        name: "description",
        content:
          "Realizacja planu, obciążenie z czasu i RPE, balans treningu oraz pełna historia ukończonych jednostek.",
      },
      { property: "og:title", content: "Postęp treningowy – BallWise" },
      {
        property: "og:description",
        content: "Realne dane z ukończonych treningów w jednym miejscu.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ProgressScreen() {
  const { state, todayIso, hydrated, syncing } = useLoadwise();
  const { user } = useAuth();
  const search = Route.useSearch();
  return (
    <ProgressWorkspace
      key={user?.id ?? "signed-out"}
      state={state}
      todayIso={todayIso}
      ownerId={user?.id}
      initialTab={search.view}
      focusSessionId={search.session}
      loading={!hydrated || syncing}
    />
  );
}
