/** Isolated, authored QA data. Never imported by an application route. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";
import { BottomNav } from "@/components/loadwise/BottomNav";
import { initialState } from "@/lib/loadwise/store/model";
import type { LoadwiseState, SessionDay, SessionHistoryRecord } from "@/lib/loadwise/types";
import { ProgressWorkspace } from "../ProgressWorkspace";
import { createBrowserResult } from "@/features/browser-lab/results";
import { buildJumpTimeline } from "@/features/browser-lab/measurement";
import { attemptPlan } from "@/features/browser-lab/protocols";
import { storeBrowserResults } from "@/features/browser-lab/storage";
import {
  createJourney,
  journeyStep,
  chooseJourney,
} from "@/features/football-iq-match/journeyEngine";
import { iqScenarioBank } from "@/features/football-iq-match/journeyBank";
import { makeJourneyAttempt, journeyHistoryKey } from "@/features/football-iq-match/journeyHistory";
import "@/styles.css";
import "@/styles/ballwise-visual-system.css";
const today = "2026-11-02",
  owner = "progress-qa",
  params = new URLSearchParams(location.search);
function day(id: string, date = today): SessionDay {
  return {
    dbId: id,
    date,
    dayType: "training",
    type: "strength_power",
    sessionType: "strength_power",
    title: id,
    durationMin: 60,
    dayName: "Poniedziałek",
    goalLabel: "Siła",
    intensity: "umiarkowana",
    reason: "",
    safetyNote: null,
    whyToday: "",
    goalOfSession: "",
    riskManaged: "",
    avoidToday: "",
    mdLabel: null,
    slotLabel: null,
    sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
    secondSession: null,
  };
}
function row(
  key: string,
  date = today,
  rpe: number | null = 6,
  durationMin = 30,
): SessionHistoryRecord {
  return { key, date, title: key, category: "gym", rpe, durationMin, notes: "" };
}
function seed(): LoadwiseState {
  if (params.get("case") === "empty") return { ...initialState };
  if (params.get("case") === "history")
    return {
      ...initialState,
      history: Array.from({ length: 45 }, (_, i) => ({
        ...row(`Trening ${String(i).padStart(2, "0")}`, i < 25 ? today : "2026-10-18"),
        category: i % 3 === 0 ? "match" : "gym",
      })),
    };
  return {
    ...initialState,
    plan: [
      day("one"),
      day("two", "2026-10-31"),
      day("planned", "2026-11-01"),
      day("future", "2026-11-03"),
    ],
    history: [
      row("one", today, 9, 80),
      row("two", "2026-10-31", null),
      row("archive", "2026-10-27", 4, 20),
      row("old", "2026-10-15", 5, 40),
      row("previous", "2026-10-23", 3, 20),
    ],
    completions: {
      one: { completed: true, status: "completed", durationMin: 24, rpe: 5, notes: "" },
      two: { completed: true, status: "completed", durationMin: 30, rpe: null, notes: "" },
    },
  };
}
const timeline = buildJumpTimeline(
  Array.from({ length: 500 }, (_, cts) => ({ cts, timescale: 240, duration: 1 })),
);
storeBrowserResults(
  owner,
  ["2026-10-29", today].flatMap((date, j) =>
    attemptPlan(["cmj"]).map((attempt, i) => ({
      ...createBrowserResult({
        attempt,
        sessionId: `qa-session-${j}`,
        timeline,
        start: 40,
        end: 139 + j,
        sourceName: "QA.mp4",
        sourceHash: (10 + j * 3 + i).toString(16).padStart(64, "0"),
        sourceBytes: 1000,
        codec: "avc1.640029",
        guidePositions: [0.5, 0.5],
        notes: "",
      }),
      recordedAt: `${date}T12:00:00.000Z`,
    })),
  ),
);
let journey = createJourney(iqScenarioBank.find((s) => s.role === "wing" && s.revision !== 3)!);
for (let i = 0; i < 10 && !journey.outcome; i++)
  journey = chooseJourney(journey, journeyStep(journey).choices[0].id, 1);
localStorage.setItem(
  journeyHistoryKey(owner),
  JSON.stringify([
    makeJourneyAttempt(journey, "learn", "qa-progress-attempt", new Date(`${today}T12:00:00.000Z`)),
  ]),
);
function Screen() {
  const [state, setState] = useState(seed);
  return (
    <>
      <button
        type="button"
        data-qa-correction
        onClick={() =>
          setState((s) => ({
            ...s,
            completions: {
              ...s.completions,
              one: { ...s.completions.one, durationMin: 12, rpe: 4 },
            },
          }))
        }
      >
        Kontrola: skoryguj zapis
      </button>
      <ProgressWorkspace state={state} todayIso={today} ownerId={owner} brand={false} />
    </>
  );
}
const root = createRootRoute({
  component: () => (
    <div className="app-shell">
      <Outlet />
      <BottomNav />
    </div>
  ),
  errorComponent: ({ error }) => (
    <pre role="alert">{error instanceof Error ? error.message : String(error)}</pre>
  ),
});
const route = createRoute({ getParentRoute: () => root, path: "/postep", component: Screen });
const router = createRouter({
  routeTree: root.addChildren([route]),
  history: createMemoryHistory({ initialEntries: ["/postep"] }),
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
