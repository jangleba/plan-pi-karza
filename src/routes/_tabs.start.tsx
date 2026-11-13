import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/loadwise/auth";
import { useLoadwise } from "@/lib/loadwise/store";
import { ProfileAvatar } from "@/components/loadwise/ui";
import { StartDashboard } from "@/components/loadwise/StartDashboard";
import {
  completeFieldTask,
  openFieldTask,
  type FieldTask,
} from "@/features/football-iq-match/fieldTask";
import { focusAim, loadMastery, type AimProgress } from "@/features/football-iq-match/masteryStore";

export const Route = createFileRoute("/_tabs/start")({
  component: StartScreen,
});

function StartScreen() {
  const { user } = useAuth();
  const { state, hydrated, todaySession } = useLoadwise();
  const navigate = useNavigate();
  const router = useRouter();
  const [iqTask, setIqTask] = useState<FieldTask | null>(null);
  const [iqGoal, setIqGoal] = useState<AimProgress | null>(null);
  useEffect(() => {
    // Read after mount: storage is browser-only.
    setIqTask(openFieldTask(user?.id));
    setIqGoal(user?.id ? focusAim(loadMastery(user.id)) : null);
  }, [user?.id]);

  if (!hydrated) return <StartLoadingState />;

  const firstName = state.profile?.name?.trim().split(/\s+/)[0] || "Zawodniku";

  return (
    <StartDashboard
      name={firstName}
      todayTitle={todaySession?.title}
      avatar={<ProfileAvatar />}
      onPlan={() => void navigate({ to: "/plan" })}
      onLab={() => void navigate({ to: "/lab" })}
      onReaction={() => void navigate({ to: "/reakcja" })}
      iqTask={
        iqTask
          ? {
              text: iqTask.text,
              onDone: () => {
                completeFieldTask(user?.id);
                setIqTask(null);
              },
            }
          : undefined
      }
      iqGoal={
        iqGoal
          ? {
              label: iqGoal.label,
              percent: Math.round(iqGoal.score * 100),
              onOpen: () => void navigate({ to: "/football-iq" }),
            }
          : undefined
      }
      onPrepareLab={() => {
        void Promise.all([
          router.preloadRoute({ to: "/lab" }),
          import("@/features/browser-lab/BrowserLab"),
        ]).catch(() => undefined);
      }}
      onPrepareReaction={() => {
        void router.preloadRoute({ to: "/reakcja" }).catch(() => undefined);
      }}
    />
  );
}

function StartLoadingState() {
  return (
    <main className="px-6 pb-32 pt-6" aria-busy="true">
      <header className="flex items-center justify-between">
        <span className="text-[17px] font-medium tracking-[-0.025em]">BallWise</span>
        <ProfileAvatar />
      </header>
      <section className="mx-auto mt-16 max-w-sm space-y-4">
        <div className="h-4 w-28 animate-pulse rounded-full bg-secondary" />
        <div className="h-40 w-full animate-pulse rounded-2xl bg-secondary" />
      </section>
    </main>
  );
}
