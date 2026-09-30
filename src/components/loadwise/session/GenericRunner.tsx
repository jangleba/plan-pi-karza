import { memo, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { TrainingSection } from "@/lib/loadwise/types";
import { useLoadwise } from "@/lib/loadwise/store";
import {
  getExerciseDefinition,
  specialistEquipmentForExercise,
} from "@/lib/loadwise/exerciseLibrary";
import { compactPrescription, formatRestValue } from "@/lib/loadwise/sessionPresentation";
import { ExerciseRow } from "./ExerciseRow";

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
  const { markEquipmentUnavailable } = useLoadwise();

  const [done, setDone] = useState<Record<string, boolean>>({});
  const [activeSectionId, setActiveSectionId] = useState<string>(sections[0]?.id ?? "");
  const toggle = (id: string) => setDone((current) => ({ ...current, [id]: !current[id] }));

  const activeSection = sections.find((s) => s.id === activeSectionId) ?? sections[0];

  return (
    <div className="relative pl-11">
      <span className="absolute bottom-5 left-[1.18rem] top-5 w-px bg-border" />
      {sections.map((section, sectionIndex) => {
        const isActive = activeSection?.id === section.id;
        const exerciseCount = section.blocks.reduce(
          (sum, block) => sum + block.exercises.length,
          0,
        );
        return (
          <section key={section.id} className="relative border-b border-border/75 last:border-b-0">
            <span
              className={`absolute -left-11 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full border text-xs font-medium ${
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground"
              }`}
            >
              {sectionIndex + 1}
            </span>
            <button
              type="button"
              onClick={() => setActiveSectionId(section.id)}
              className="flex w-full items-center gap-3 py-4 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-foreground">
                  {SECTION_TAB_LABELS[section.type] ?? section.title}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
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
                    <div
                      key={block.id}
                      className={blockIndex > 0 ? "border-t border-border/60 pt-4" : ""}
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <h4 className="truncate text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                          {blockTitle}
                        </h4>
                        {block.exercises[0] && (
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {compactPrescription(block.exercises[0])}
                          </span>
                        )}
                      </div>
                      <div className="divide-y divide-border/50">
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
                        <p className="mt-3 text-[11px] text-muted-foreground">
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
