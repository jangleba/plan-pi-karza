/** Standalone browser QA of the first-person IQ: real three.js scene and model, local storage only. */
import { createRoot } from "react-dom/client";
import { FirstPersonIQ } from "../firstPerson/FirstPersonIQ";
import "@/styles.css";
import "@/styles/ballwise-visual-system.css";

const query = new URLSearchParams(location.search);
(window as unknown as { __BALLWISE_FP_QA__: boolean }).__BALLWISE_FP_QA__ = true;
createRoot(document.getElementById("root")!).render(
  <FirstPersonIQ
    historyOwner="fp-browser-qa"
    initialSeed={query.has("seed") ? Number(query.get("seed")) : undefined}
    onBack={() => undefined}
    onOpenClassic={() => undefined}
  />,
);
