import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { AppHeader } from "@/components/loadwise/ui";
import { useAuth } from "@/lib/loadwise/auth";
const BrowserLab = lazy(() => import("@/features/browser-lab/BrowserLab"));
export const Route = createFileRoute("/_tabs/lab")({
  component: LabScreen,
  head: () => ({
    meta: [
      { title: "BallWise Lab | Testy z filmu" },
      {
        name: "description",
        content:
          "Skoki, sprint i 505 z oryginalnych filmów 120/240 FPS. Protokoły, historia i porównania prób.",
      },
    ],
  }),
});
function LabScreen() {
  const { user } = useAuth();
  return (
    <div className="pb-[calc(120px+env(safe-area-inset-bottom))]">
      <AppHeader title="BallWise Lab" subtitle="Testy motoryczne z oryginalnego filmu" />
      {user && (
        <Suspense fallback={<p className="px-5 text-sm text-muted-foreground">Wczytuję Lab…</p>}>
          <BrowserLab key={user.id} ownerId={user.id} />
        </Suspense>
      )}
    </div>
  );
}
