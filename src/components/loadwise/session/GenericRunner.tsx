import { memo, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { TrainingSection } from "@/lib/loadwise/types";
import { useLoadwise } from "@/lib/loadwise/store";
import {
  getExerciseDefinition,
  specialistEquipmentForExercise,
} from "@/lib/loadwise/exerciseLibrary";
import { formatRestValue } from "@/lib/loadwise/sessionPresentation";
import { ExerciseRow } from "./ExerciseRow";
import { useActivityExitGuard } from "../ActivityExitGuard";

const SECTION_TAB_LABELS: Record<string, string> = {
  warmup: "Przygotowanie ruchowe",
  prep: "Przygotowanie ruchowe",
  main: "Część główna",
  accessory: "Ćwiczenia uzupełniające",
  footballTransfer: "Transfer piłkarski",
  cooldown: "Część końcowa",
};

export const StructuredSections = memo(function StructuredSections({
  sections,
  date,
  sessionId,
}: {
  sections: TrainingSection[];
  date: string;
  sessionId?: string | null;
}) {
  const { markEquipmentUnavailable, state } = useLoadwise();

  const [done, setDone] = useState<Record<string, boolean>>({});
  const [activeSectionId, setActiveSectionId] = useState<string>(sections[0]?.id ?? "");
  useActivityExitGuard({
    dirty: Object.values(done).some(Boolean) && !state?.completions[sessionId ?? ""]?.completed,
    description: "Oznaczenia ćwiczeń w tej sesji nie zostały zapisane.",
  });
  useEffect(() => setDone({}), [date, sessionId]);
  const toggle = (id: string) => setDone((current) => ({ ...current, [id]: !current[id] }));

  const activeSection = sections.find((s) => s.id === activeSectionId) ?? sections[0];

  return (
    <div className="bw-stack">
      {sections.map((section) => {
        const isActive = activeSection?.id === section.id;
        const exerciseCount = section.blocks.reduce(
          (sum, block) => sum + block.exercises.length,
          0,
        );
        return (
          <section key={section.id} className="bw-section">
            <button
              type="button"
              onClick={() => setActiveSectionId(section.id)}
              aria-expanded={isActive}
              className="flex w-full items-center gap-3 py-4 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="bw-section-title block text-foreground">
                  {SECTION_TAB_LABELS[section.type] ?? section.title}
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {exerciseCount}{" "}
                  {exerciseCount === 1
                    ? "ćwiczenie"
                    : exerciseCount >= 2 && exerciseCount <= 4
                      ? "ćwiczenia"
                      : "ćwiczeń"}
                </span>
              </span>
              <ChevronRight
                className={`h-4 w-4 text-muted-foreground transition-transform ${isActive ? "rotate-90" : ""}`}
              />
            </button>

            {isActive && (
              <div className="pb-5">
                {section.blocks.map((block, blockIndex) => {
                  const blockTitle = block.title || block.exercises[0]?.name || "Blok ćwiczeń";
                  const blockRest = block.restAfterBlock
                    ? formatRestValue(block.restAfterBlock)
                    : null;
                  return (
                    <div key={block.id} className={blockIndex > 0 ? "mt-6" : ""}>
                      {blockTitle !== block.exercises[0]?.name && (
                        <h4 className="mb-2 text-base font-medium text-muted-foreground">
                          {blockTitle}
                        </h4>
                      )}
                      <div className="space-y-2">
                        {block.exercises.map((exercise, exerciseIndex) => {
                          const equipmentIds = specialistEquipmentForExercise(
                            getExerciseDefinition(exercise.exerciseId ?? exercise.name),
                          );
                          return (
                            <ExerciseRow
                              key={exercise.id}
                              e={exercise}
                              index={exerciseIndex}
                              done={!!done[exercise.id]}
                              onToggle={() => toggle(exercise.id)}
                              onUnavailable={() => {
                                if (equipmentIds.length)
                                  markEquipmentUnavailable(date, exercise, equipmentIds);
                              }}
                              equipmentIds={equipmentIds}
                              sessionId={sessionId}
                            />
                          );
                        })}
                      </div>
                      {blockRest && (
                        <p className="mt-3 text-sm text-muted-foreground">
                          Przerwa po bloku: {blockRest}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
});
