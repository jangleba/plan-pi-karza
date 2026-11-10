import { RouteMotion } from "@/components/loadwise/RouteMotion";
/** Browser-only QA entry; no production route imports it. Uses isolated local data. */
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { FuelWorkspace } from "../FuelWorkspace";
import { emptyFuelData, fuelStorageKey, localDate, manualFuelContext } from "@/lib/fuel/experience";
import { createRecipeEntry, practicalRecipes, relativeFuelTiming } from "@/lib/fuel/practical";
import { evaluateStoreProduct } from "@/lib/fuel/storeCheck";
import "@/styles/fuel-v3.css";
import "@/styles/fuel-v4.css";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { BottomNav } from "@/components/loadwise/BottomNav";
import { SessionHeader } from "@/components/loadwise/session/SessionChrome";
import { ClubMonitoring, CompletionPanel } from "@/components/loadwise/session/SessionCompletion";
import { SessionStartPanel } from "@/components/loadwise/session/SessionStartPanel";
import { FootballIQJourney } from "@/features/football-iq-match/FootballIQJourney";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
import { useLoadwise } from "@/lib/loadwise/store";
import { StartDashboard } from "@/components/loadwise/StartDashboard";
const now = Date.now();
const date = localDate(now);
const tomorrow = new Date(now);
tomorrow.setDate(tomorrow.getDate() + 1);
const context = {
  ...manualFuelContext(date, "match", 90, "high"),
  key: date + ":qa-match:1",
  fromPlan: true,
};
const future = {
  ...context,
  date: localDate(tomorrow.getTime()),
  key: localDate(tomorrow.getTime()) + ":qa-match:1",
};
const mode = new URLSearchParams(location.search).get("mode");
const club = sessionFixture({
  dbId: "qa-club",
  title: "Trening klubowy",
  dayType: "club",
  sessionType: "Klub",
  durationMin: 90,
  date,
});
let visualState = {
  profile: { healthPersonalizationEnabled: false },
  completions: {} as Record<string, unknown>,
};
const subscribers = new Set<() => void>();
Object.assign(window, {
  __visualStore: {
    snapshot: () => visualState,
    subscribe: (listener: () => void) => {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    startSession: async () => {
      visualState = {
        ...visualState,
        completions: { ["qa-club"]: { status: "started", completed: false } },
      };
      subscribers.forEach((listener) => listener());
    },
    completeSession: async () => {
      visualState = {
        ...visualState,
        completions: { ["qa-club"]: { status: "completed", completed: true } },
      };
      subscribers.forEach((listener) => listener());
    },
  },
});
const data = emptyFuelData();
data.timings[context.key] = relativeFuelTiming(120, now)!;
const recipe = practicalRecipes({ context, timing: data.timings[context.key], now, data })[0];
// "no-time": the athlete has not said yet when the session starts.
if (mode === "no-time") delete data.timings[context.key];
if (mode === "adjusted") {
  const entry = createRecipeEntry(recipe, context.key, "selected", now, "adjusted");
  entry.lines = entry.lines.map((l) => ({ ...l, grams: l.grams * 2 }));
  data.entries = [entry];
}
if (mode === "history")
  data.entries = [
    {
      ...createRecipeEntry(recipe, context.key, "eaten", now - 3600_000, "eaten"),
      phase: "before",
      sessionKind: "match",
      minutesBefore: 180,
    },
  ];
localStorage.setItem(fuelStorageKey("fuel-qa"), JSON.stringify(data));
Object.assign(window, {
  __fuelQA: {
    contextKey: context.key,
    tomorrowKey: future.key,
    baseLines: recipe.lines,
    read: () => JSON.parse(localStorage.getItem(fuelStorageKey("fuel-qa"))!),
    allergenVerdict: evaluateStoreProduct({
      product: {
        name: "Mix",
        allergens: ["en:crustaceans"],
        source: "openfoodfacts",
        nutriments: { carbohydrates100g: 40, protein100g: 15 },
      },
      restrictions: ["krewetki"],
      moment: "after",
      load: "high",
    }).label,
  },
});
function FuelView() {
  return (
    <>
      <header className="fuel-qa-banner">Fuel · dane kontrolne interfejsu</header>
      <FuelWorkspace
        userId="fuel-qa"
        contexts={[
          mode === "completed" ? { ...context, completed: true, endedAt: now - 60_000 } : context,
        ]}
        tomorrowContext={future}
      />
    </>
  );
}
function ClubView() {
  const { state } = useLoadwise();
  return (
    <div className="bw-session-page pb-6">
      <SessionHeader session={club} isToday preview={false} onBack={() => undefined} />
      <div className="bw-session-body mt-5 space-y-4 px-5">
        <SessionStartPanel session={club} canStart />
        <ClubMonitoring session={club} />
        {state.completions["qa-club"] && <CompletionPanel session={club} />}
      </div>
    </div>
  );
}
const rootRoute = createRootRoute({
  component: () => (
    <div className="app-shell pb-28">
      <RouteMotion>
        <Outlet />
      </RouteMotion>
      <BottomNav />
      <Toaster />
    </div>
  ),
});
const routes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/start",
    component: () => (
      <StartDashboard
        name="Johny"
        avatar={
          <button className="bw-avatar" aria-label="Profil">
            J
          </button>
        }
        plan={[{ ...club, title: "Mecz", dayType: "match", sessionType: "Mecz" }]}
        completions={{}}
        todayIso={date}
        checkinComplete={false}
        checkinDetail="Zmień plan na dziś"
        busy={false}
        onCheckin={() => undefined}
        onLab={() => undefined}
        onReaction={() => undefined}
        onPlan={() => void qaRouter.navigate({ to: "/plan" })}
        onOpen={() => void qaRouter.navigate({ to: "/plan" })}
        onPrepare={() => undefined}
      />
    ),
  }),
  createRoute({ getParentRoute: () => rootRoute, path: "/fuel", component: FuelView }),
  createRoute({ getParentRoute: () => rootRoute, path: "/plan", component: ClubView }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/football-iq",
    component: () => (
      <FootballIQJourney
        initialScenario={new URLSearchParams(location.search).has("advanced") ? undefined : 0}
        position="forward"
        historyOwner="visual-qa"
      />
    ),
  }),
];
const qaRouter = createRouter({
  defaultViewTransition: true,
  routeTree: rootRoute.addChildren(routes),
  history: createMemoryHistory({
    initialEntries: [
      mode === "visual-start"
        ? "/start"
        : mode === "visual-club"
          ? "/plan"
          : mode === "visual-iq"
            ? "/football-iq"
            : "/fuel",
    ],
  }),
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={qaRouter} />);
