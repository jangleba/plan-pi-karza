import { RouteMotion } from "@/components/loadwise/RouteMotion";
/** Actual screens on authored data, isolated from authentication, billing and backend writes. */
import type { FunctionComponent } from "react";
import { createRoot } from "react-dom/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { Route as PlanRoute } from "@/routes/_tabs.plan";
import { Route as ProfileRoute } from "@/routes/_tabs.profil";
import { Route as AuthRoute } from "@/routes/auth";
import { Route as OnboardingRoute } from "@/routes/onboarding";
import { Route as LabRoute } from "@/routes/_tabs.lab";
import { BottomNav } from "@/components/loadwise/BottomNav";
import { SprintSessionHeader } from "@/components/loadwise/session/SprintSessionHeader";
import { SprintStructuredSections } from "@/components/loadwise/session/SprintRunner";
import { StrengthStructuredSections } from "@/components/loadwise/session/StrengthRunner";
import { SessionHeader } from "@/components/loadwise/session/SessionChrome";
import {
  sessionFixture,
  sprintSectionsFixture,
  sectionFixture,
} from "@/components/loadwise/session/testFixtures";
import "@/styles.css";
import "@/styles/ballwise-visual-system.css";
PlanRoute.useSearch = (() => ({ week: undefined })) as typeof PlanRoute.useSearch;
OnboardingRoute.useSearch = (() => ({ edit: true })) as typeof OnboardingRoute.useSearch;
LabRoute.useSearch = (() => ({})) as typeof LabRoute.useSearch;
const screen = new URLSearchParams(location.search).get("screen") || "plan";
const entries: Record<string, FunctionComponent> = {
  plan: PlanRoute.options.component as FunctionComponent,
  profile: ProfileRoute.options.component as FunctionComponent,
  auth: AuthRoute.options.component as FunctionComponent,
  onboarding: OnboardingRoute.options.component as FunctionComponent,
  lab: LabRoute.options.component as FunctionComponent,
};
function previewSprintSections() {
  const sections = sprintSectionsFixture();
  sections[0].blocks[0].exercises[0].restAfterExercise = "60 s";
  return sections;
}
const sprint = sessionFixture({
  date: "2026-11-02",
  title: "Sprint: prędkość maksymalna",
  durationMin: 58,
  sessionType: "sprint_acceleration",
  type: "sprint_acceleration",
  structuredSections: previewSprintSections(),
});
function Sprint() {
  return (
    <main className="app-shell bw-sprint-page">
      <SprintSessionHeader session={sprint} onBack={() => {}} />
      <div className="bw-sprint-content">
        <SprintStructuredSections
          sections={previewSprintSections()}
          session={sprint}
          date={sprint.date}
          onFinish={() => {}}
        />
      </div>
    </main>
  );
}
function Strength() {
  return (
    <main className="bw-session-page">
      <SessionHeader
        session={sessionFixture({
          title: "Siła i moc",
          date: "2026-11-02",
          sessionType: "strength_power",
        })}
        strengthRunner
        isToday
        onBack={() => {}}
      />
      <div className="px-5">
        <StrengthStructuredSections
          sections={[
            sectionFixture("main", [
              {
                id: "squat",
                exerciseId: "goblet_squat",
                name: "Przysiad goblet",
                sets: "3",
                reps: "8",
                restAfterExercise: "90 s",
              },
              {
                id: "push",
                exerciseId: "push_up",
                name: "Pompka",
                sets: "2",
                reps: "8",
                restAfterExercise: "60 s",
              },
            ]),
          ]}
          date="2026-11-02"
          onFinish={() => {}}
        />
      </div>
    </main>
  );
}
entries.sprint = Sprint;
entries.strength = Strength;
const View = entries[screen] || entries.plan;
const root = createRootRoute({
  component: () => (
    <div className="app-shell pb-24" data-design-screen={screen}>
      <RouteMotion>
        <Outlet />
      </RouteMotion>
      {!["auth", "onboarding", "sprint", "strength"].includes(screen) && <BottomNav />}
    </div>
  ),
});
const route = createRoute({ getParentRoute: () => root, path: "/" + screen, component: View });
const router = createRouter({
  defaultViewTransition: true,
  routeTree: root.addChildren([route]),
  history: createMemoryHistory({ initialEntries: ["/" + screen] }),
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
