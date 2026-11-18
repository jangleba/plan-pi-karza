/** Standalone browser QA of the 11v11 IQ: real three.js scene and models, local storage only. */
import { createRoot } from "react-dom/client";
import { ElevenIQ } from "../eleven/ElevenIQ";
import type { E11Role } from "../eleven/e11Variants";
import "@/styles.css";
import "@/styles/ballwise-visual-system.css";

const query = new URLSearchParams(location.search);
(window as unknown as { __BALLWISE_FP_QA__: boolean }).__BALLWISE_FP_QA__ = true;
createRoot(document.getElementById("root")!).render(
  <ElevenIQ
    historyOwner="e11-browser-qa"
    initialSeed={query.has("seed") ? Number(query.get("seed")) : undefined}
    initialRole={(query.get("role") as E11Role | null) ?? undefined}
    onBack={() => undefined}
  />,
);
