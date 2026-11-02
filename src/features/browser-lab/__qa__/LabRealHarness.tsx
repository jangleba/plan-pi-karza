/** Real video/decoder/geometry UI on isolated QA data. Never imported by an app route. */
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
import { AppHeader } from "@/components/loadwise/ui";
import BrowserLab from "../BrowserLab";
import { VideoAnalyzer } from "../VideoAnalyzer";
import { PROTOCOLS, attemptPlan, type BrowserTestId } from "../protocols";
import type { BrowserResult } from "../results";
import "@/styles.css";
import "@/styles/ballwise-visual-system.css";
const params = new URLSearchParams(location.search),
  qa = { saved: [] as BrowserResult[] };
Object.assign(window, { __labRealQA: qa });
function Screen() {
  const [saved, setSaved] = useState(false);
  const test = PROTOCOLS.find((p) => p.id === params.get("case"));
  if (!test) return <BrowserLab ownerId="lab-real-qa" />;
  const attempts = attemptPlan([test.id as BrowserTestId]),
    attempt = attempts.find((a) => a.side === params.get("side")) ?? attempts[0];
  return (
    <div className="browser-lab">
      <VideoAnalyzer
        ownerId="lab-real-qa"
        attempt={attempt}
        sessionId="lab-real-browser-qa"
        onSave={(result) => {
          qa.saved.push(result);
          setSaved(true);
        }}
      />
      {saved && <output data-lab-saved>Wynik kontrolny zapisany</output>}
    </div>
  );
}
const root = createRootRoute({
  component: () => (
    <div className="app-shell">
      {/* Account avatar requires the authenticated app store. This isolated
          decoder screen deliberately has no account or backend connection. */}
      <AppHeader title="BallWise Lab" subtitle="Dane kontrolne interfejsu" brand={false} />
      <Outlet />
      <BottomNav />
    </div>
  ),
});
const lab = createRoute({ getParentRoute: () => root, path: "/lab", component: Screen });
const router = createRouter({
  routeTree: root.addChildren([lab]),
  history: createMemoryHistory({ initialEntries: ["/lab"] }),
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
