import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLoadwise } from "@/lib/loadwise/store";
import { useAuth } from "@/lib/loadwise/auth";
import { ProgressWorkspace } from "@/components/progress/ProgressWorkspace";
import type { NextPlanDraft } from "@/lib/loadwise/nextPlanInterview";
import { parseNextPlanIntent, type NextPlanIntent } from "@/lib/loadwise/nextPlanIntent";
import { trainingStorageKey } from "@/lib/loadwise/trainingDetails";
import { useTrainingLocalState } from "@/lib/loadwise/useTrainingLocalState";

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
  const { state, todayIso, hydrated, syncing, updateProfile } = useLoadwise();
  const { user } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const intent = useTrainingLocalState<NextPlanIntent | null>(
    trainingStorageKey("next-plan-intent", user?.id),
    null,
    parseNextPlanIntent,
  );
  const stored = state.plan[0]?.engineTimeBudgetMin;
  const currentMinutes = typeof stored === "number" && stored >= 10 && stored <= 120 ? stored : 75;
  // Saves only the confirmed profile changes; the plan itself is saved later, after the preview.
  async function prepareNextPlan(draft: NextPlanDraft) {
    if (draft.profileChanged) await updateProfile(draft.profile);
    intent.setValue({
      planId: state.activePlanId ?? null,
      minutes: draft.minutes,
      createdAt: new Date().toISOString(),
    });
    await navigate({ to: "/plan" });
  }
  return (
    <ProgressWorkspace
      key={user?.id ?? "signed-out"}
      state={state}
      todayIso={todayIso}
      ownerId={user?.id}
      initialTab={search.view}
      focusSessionId={search.session}
      loading={!hydrated || syncing}
      planEnd={user ? { currentMinutes, onPrepare: prepareNextPlan } : undefined}
    />
  );
}
