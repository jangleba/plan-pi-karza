/** A frozen, unexecuted legacy session matching the reported 18-row structure. */
import { sectionFixture, sessionFixture } from "@/components/loadwise/session/testFixtures";
import type { TrainingExercise } from "@/lib/loadwise/types";
const blocked =
  "Nie ma odpowiedniego wariantu przy tych ustawieniach. Sprawdź ćwiczenie z trenerem.";
const row = (
  id: string,
  exerciseId: string,
  name: string,
  sets: string,
  reps: string,
  extra: Partial<TrainingExercise> = {},
) => ({ id, exerciseId, name, sets, reps, ...extra });
export function legacyStrengthSession() {
  return sessionFixture({
    dbId: "legacy-18",
    date: "2026-11-01",
    title: "Siłownia: siła dolna (technika)",
    sessionType: "Siłownia",
    type: "strength_power",
    durationMin: 50,
    executionProtected: true,
    structuredSections: [
      sectionFixture("warmup", [
        row("warm-run", "easy_aerobic_run", "Łatwy bieg tlenowy", "1", "5–7 min"),
        row("warm-hip", "hip_mobility_flow", "Mobilność bioder", "1", "6 min"),
        row("warm-bridge", "glute_bridge", "Most biodrowy", "2", "10–12"),
      ]),
      {
        ...sectionFixture("main", []),
        blocks: [
          {
            id: "old-a",
            title: "A",
            blockType: "contrast",
            intent: "power",
            restAfterBlock: "2–4 min",
            exercises: [
              row("old-squat", "back_squat", "Przysiad", "3–4", "5–8", {
                label: "A1",
                rir: "3–4",
                restAfterPair: "2–4 min",
              }),
              row("old-landing", "snap_down", "Lądowanie snap-down", "2", "3", {
                label: "A2",
                restAfterPair: "2–4 min",
              }),
            ],
          },
          {
            id: "old-b",
            title: "B",
            blockType: "contrast",
            intent: "power",
            restAfterBlock: "90–120 s",
            exercises: [
              row("old-curl", "lying_leg_curl", "Uginanie nóg", "2–3", "6–8", {
                label: "B1",
                rir: "2–3",
                executionBlockedReason: blocked,
                restAfterPair: "90–120 s",
              }),
              row("old-landing-2", "snap_down", "Lądowanie snap-down", "2", "3", {
                label: "B2",
                restAfterPair: "90–120 s",
              }),
            ],
          },
        ],
      },
      sectionFixture("accessory", [
        row("old-pallof", "pallof_press", "Pallof press", "2", "8–10", { label: "C1" }),
        row("old-dead-bug", "dead_bug", "Martwy robak", "2", "8–10", { label: "C2" }),
        row("old-calf", "standing_calf_raise", "Wspięcia na palce", "2", "12–15", {
          label: "D1",
          executionBlockedReason: blocked,
        }),
        row("old-face-pull", "face_pull_band", "Face pull z gumą", "2", "10–12", { label: "D2" }),
        ...Array.from({ length: 4 }, (_, i) =>
          row(`old-extra-${i}`, "lying_leg_curl", "Uginanie nóg", "2", "6–8", {
            executionBlockedReason: blocked,
          }),
        ),
      ]),
      sectionFixture("cooldown", [
        row("cool-bike", "easy_cycle_recovery", "Lekki rower regeneracyjny", "1", "5 min"),
        row("cool-hip", "hip_mobility_flow", "Mobilność bioder", "1", "4 min"),
        row("cool-breath", "diaphragmatic_breathing", "Oddech przeponowy", "1", "2 min"),
      ]),
    ],
  });
}
