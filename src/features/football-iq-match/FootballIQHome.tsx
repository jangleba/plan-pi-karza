/** The IQ tab: the first-person 5v5 lesson by default. The 3v2 lesson and the situations on
 * the tactics board stay one tap away; their history and progress are unchanged. */
import { Suspense, lazy, useState, type ComponentProps } from "react";
import { FiveAsideIQ } from "./fiveAside/FiveAsideIQ";
import type { LearningJourney as LearningJourneyType } from "./LearningJourney";

const LearningJourney = lazy(() =>
  import("./LearningJourney").then((m) => ({ default: m.LearningJourney })),
);
const FirstPersonIQ = lazy(() =>
  import("./firstPerson/FirstPersonIQ").then((m) => ({ default: m.FirstPersonIQ })),
);
type Props = ComponentProps<typeof LearningJourneyType>;

export function FootballIQHome(props: Props) {
  const [mode, setMode] = useState<"five" | "three" | "board">("five");
  const loading = <div className="p-6 text-sm text-muted-foreground">Ładowanie sytuacji…</div>;
  if (mode === "board")
    return (
      <Suspense fallback={loading}>
        <LearningJourney {...props} onBack={() => setMode("five")} />
      </Suspense>
    );
  if (mode === "three")
    return (
      <Suspense fallback={loading}>
        <FirstPersonIQ
          historyOwner={props.historyOwner}
          onBack={() => setMode("five")}
          onOpenClassic={() => setMode("board")}
        />
      </Suspense>
    );
  return (
    <FiveAsideIQ
      historyOwner={props.historyOwner}
      onBack={() => props.onBack?.()}
      onOpenClassic={() => setMode("board")}
      onOpenThreeVsTwo={() => setMode("three")}
    />
  );
}
