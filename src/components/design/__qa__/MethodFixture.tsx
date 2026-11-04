/** Browser-only authored conditions; production account APIs are replaced by the QA harness. */
import { useMemo } from "react";
import { useLoadwise } from "@/lib/loadwise/store";
import { buildStrengthPowerStructured, structuredToFlat } from "@/lib/loadwise/strengthBlocks";
import { createMethodSession } from "@/lib/loadwise/methods/planner";
import { getTrainingMethod } from "@/lib/loadwise/methods/catalogue";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
import { TrainingMethodPanel } from "@/components/loadwise/session/TrainingMethodPanel";
import { MethodExecutionCoach } from "@/components/loadwise/session/MethodExecutionCoach";
import { StrengthStructuredSections } from "@/components/loadwise/session/StrengthRunner";
import { StructuredSections } from "@/components/loadwise/session/GenericRunner";
import { SessionHeader } from "@/components/loadwise/session/SessionChrome";
import type { TrainingMethodId } from "@/lib/loadwise/methods/types";
export function MethodFixture() {
  const { state } = useLoadwise();
  const session = useMemo(() => {
    const p = {
      ...state.profile!,
      age: 25,
      gymExperienceLevel: "advanced" as const,
      strengthTrainingMonths: 36,
      movementCompetence: "high" as const,
      supervisionLevel: "full" as const,
    };
    const query = new URLSearchParams(location.search),
      id = (query.get("method") ?? "M08") as TrainingMethodId,
      m = getTrainingMethod(id)!;
    const b = buildStrengthPowerStructured(p, {
      mdLabel: "MD-5",
      weekPhase: "development",
      weekIndex: 1,
      gymSessionIndexInWeek: 0,
      gymSessionsThisWeekTotal: 2,
      powerFocus: false,
      history: { usedMainThisWeek: [], usedMainLastWeek: [], usedRolesThisWeek: [] },
    })!;
    const title =
      m.domain === "strength" || m.domain === "power"
        ? "Siłownia: siła dolna"
        : m.domain === "sprint"
          ? "Sprint: przyspieszenie"
          : m.domain === "conditioning"
            ? "Interwały tlenowe"
            : "Technika piłkarska";
    return createMethodSession(
      sessionFixture({
        dbId: "qa-method",
        date: "2026-11-03",
        title,
        sessionType: title,
        goalOfSession: title,
        mdLabel: "MD-5",
        blockPhaseLabel: "Rozwój",
        blockWeekNumber: 2,
        structuredSections: b.sections,
        sections: structuredToFlat(b.sections),
      }),
      p,
      id,
      {
        coachPresent: true,
        participants: 4,
        spaceLengthM: 450,
        validatedVelocityDevice: true,
        equipment: ["flywheel", "fixed_pins", "hill", "assistance_rig", "velocity_device"],
      },
    );
  }, [state.profile]);
  const strength = ["strength", "power"].includes(
    getTrainingMethod(session.trainingMethods!.primary)!.domain,
  );
  return (
    <main className="app-shell bw-strength-page">
      <SessionHeader
        session={session}
        strengthRunner={strength}
        isToday={false}
        onBack={() => {}}
      />
      <div className="bw-sprint-content">
        <TrainingMethodPanel session={session} wholeDay={session} />
        {strength ? (
          <StrengthStructuredSections
            sections={session.structuredSections!}
            date={session.date}
            sessionId={session.dbId}
            onFinish={() => {}}
          />
        ) : (
          <>
            {session
              .structuredSections!.flatMap((s) => s.blocks.flatMap((b) => b.exercises))
              .filter((e) => e.methodExecution)
              .map((e) => (
                <MethodExecutionCoach key={e.id} plan={e.methodExecution!} context={`qa:${e.id}`} />
              ))}
            <StructuredSections
              sections={session.structuredSections!}
              date={session.date}
              sessionId={session.dbId}
            />
          </>
        )}
      </div>
    </main>
  );
}
