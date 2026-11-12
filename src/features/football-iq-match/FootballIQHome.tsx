/** The IQ tab: the first-person 3v2 lesson by default; the earlier situations on the tactics
 * board stay one tap away (their history and progress are unchanged). */
import { Suspense, lazy, useState, type ComponentProps } from "react";
import { FirstPersonIQ } from "./firstPerson/FirstPersonIQ";
import type { LearningJourney as LearningJourneyType } from "./LearningJourney";

const LearningJourney = lazy(() =>
  import("./LearningJourney").then((m) => ({ default: m.LearningJourney })),
);
type Props = ComponentProps<typeof LearningJourneyType>;

export function FootballIQHome(props: Props) {
  const [mode, setMode] = useState<"first-person" | "board">("first-person");
  if (mode === "board")
    return (
      <Suspense
        fallback={<div className="p-6 text-sm text-muted-foreground">Ładowanie sytuacji…</div>}
      >
        <LearningJourney {...props} onBack={() => setMode("first-person")} />
      </Suspense>
    );
  return (
    <FirstPersonIQ
      historyOwner={props.historyOwner}
      onBack={() => props.onBack?.()}
      onOpenClassic={() => setMode("board")}
    />
  );
}
