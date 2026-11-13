/** Authored profiles, the strength builder/eligibility and real exercise sheets; no account writes. */
import { useMemo } from "react";
import { useLoadwise } from "@/lib/loadwise/store";
import { StrengthStructuredSections } from "@/components/loadwise/session/StrengthRunner";
import { StrengthExperienceSetup } from "@/components/loadwise/session/StrengthExperienceSetup";
import { SessionHeader } from "@/components/loadwise/session/SessionChrome";
import { qaStrengthSession } from "./qaPlanFixture";

export function StrengthEngineFixture() {
  const { state } = useLoadwise();
  const profile = state.profile!;
  const session = useMemo(
    () =>
      qaStrengthSession(
        profile,
        "2026-11-03",
        `qa-strength-${profile.gymExperienceLevel ?? "unknown"}-${profile.goal}`,
      ),
    [profile],
  );
  return (
    <main className="app-shell bw-strength-page">
      <SessionHeader session={session} isToday={false} preview onBack={() => {}} />
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
