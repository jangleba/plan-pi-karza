/** Authored profiles, actual generator/eligibility and real exercise sheets; no account writes. */
import { useMemo } from "react";
import { useLoadwise } from "@/lib/loadwise/store";
import { buildStrengthPowerStructured, structuredToFlat } from "@/lib/loadwise/strengthBlocks";
import { enforceStrengthEligibility } from "@/lib/loadwise/strengthEligibility";
import { StrengthStructuredSections } from "@/components/loadwise/session/StrengthRunner";
import { StrengthExperienceSetup } from "@/components/loadwise/session/StrengthExperienceSetup";
import { SessionHeader } from "@/components/loadwise/session/SessionChrome";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";

export function StrengthEngineFixture() {
  const { state } = useLoadwise();
  const profile = state.profile!;
  const session = useMemo(() => {
    const plan = buildStrengthPowerStructured(profile, {
      mdLabel: "MD-5",
      weekPhase: "development",
      weekIndex: 1,
      gymSessionIndexInWeek: 0,
      gymSessionsThisWeekTotal: 2,
      readiness: 8,
      powerFocus: profile.goal === "power",
      history: { usedRolesThisWeek: [], usedMainThisWeek: [], usedMainLastWeek: [] },
    })!;
    return enforceStrengthEligibility(
      sessionFixture({
        dbId: `qa-strength-${profile.gymExperienceLevel ?? "unknown"}-${profile.goal}`,
        date: "2026-11-03",
        title: plan.title,
        durationMin: plan.durationMin,
        sessionType: plan.sessionType,
        intensity: plan.intensity,
        mdLabel: "MD-5",
        blockPhaseLabel: "Tydz. 2 — budowanie",
        structuredSections: plan.sections,
        sections: structuredToFlat(plan.sections),
      }),
      profile,
    );
  }, [profile]);
  return (
    <main className="app-shell bw-strength-page">
      <SessionHeader session={session} strengthRunner isToday={false} onBack={() => {}} />
      <div className="bw-sprint-content">
        <StrengthExperienceSetup />
        <StrengthStructuredSections
          sections={session.structuredSections!}
          date={session.date}
          sessionId={session.dbId}
          onFinish={() => {}}
        />
      </div>
    </main>
  );
}
