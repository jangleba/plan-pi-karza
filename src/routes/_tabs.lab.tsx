import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { AppHeader } from "@/components/loadwise/ui";
import { useAuth } from "@/lib/loadwise/auth";
import { TEST_IDS, type BrowserTestId } from "@/features/browser-lab/protocols";
const BrowserLab = lazy(() => import("@/features/browser-lab/BrowserLab"));
export const Route = createFileRoute("/_tabs/lab")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { view?: "history"; test?: BrowserTestId } => ({
    ...(search.view === "history" ? { view: "history" as const } : {}),
    ...(TEST_IDS.includes(search.test as BrowserTestId)
      ? { test: search.test as BrowserTestId }
      : {}),
  }),
  component: LabScreen,
  head: () => ({
    meta: [
      { title: "BallWise Lab | Testy z filmu" },
      {
        name: "description",
        content:
          "Skoki, sprint i 505 z oryginalnych filmów HD/4K od 15 FPS. Protokoły, historia i porównania prób.",
      },
    ],
  }),
});
function LabScreen() {
  const { user } = useAuth();
  const { view, test } = Route.useSearch();
  return (
    <div className="pb-[calc(120px+env(safe-area-inset-bottom))]">
      <AppHeader title="Lab" subtitle="Testy motoryczne z oryginalnego filmu" sketch="measure" />
      {user && (
        <Suspense fallback={<p className="px-5 text-sm text-muted-foreground">Wczytuję Lab…</p>}>
          <BrowserLab
            key={`${user.id}:${view ?? "tests"}:${test ?? ""}`}
            ownerId={user.id}
            initialTab={view === "history" ? "history" : "tests"}
            initialTest={view === "history" ? undefined : test}
          />
        </Suspense>
      )}
    </div>
  );
}
