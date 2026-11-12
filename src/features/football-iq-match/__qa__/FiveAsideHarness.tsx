/** Standalone browser QA of the 5v5 IQ: real three.js scene and models, local storage only. */
import { createRoot } from "react-dom/client";
import { FiveAsideIQ } from "../fiveAside/FiveAsideIQ";
import type { Position } from "../fiveAside/f5Variants";
import "@/styles.css";
import "@/styles/ballwise-visual-system.css";

const query = new URLSearchParams(location.search);
(window as unknown as { __BALLWISE_FP_QA__: boolean }).__BALLWISE_FP_QA__ = true;
createRoot(document.getElementById("root")!).render(
  <FiveAsideIQ
    historyOwner="f5-browser-qa"
    initialSeed={query.has("seed") ? Number(query.get("seed")) : undefined}
    initialPosition={(query.get("position") as Position | null) ?? undefined}
    onBack={() => undefined}
    onOpenClassic={() => undefined}
    onOpenThreeVsTwo={() => undefined}
  />,
);
