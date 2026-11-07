import type { SessionDay } from "@/lib/loadwise/types";

const NON_RUNNING = /rower|bike|basen|pływ|ergometr|orbitrek/i;

export function isTrackableEnduranceRun(session: SessionDay): boolean {
  if (session.isUnavailable || session.dayType !== "training") return false;
  const text = `${session.title} ${session.sessionType} ${session.goalOfSession}`;
  if (NON_RUNNING.test(text)) return false;
  if (session.classification) return session.classification.isEndurance;
  if (session.type === "endurance_running") return true;
  return /bieg|wytrzyma|wydol|tlen|tempo|interwa|rsa|kondyc/i.test(text);
}

/** Resolve a legacy cycle/walk alias only where its explicit cue prescribes walking/running. */
export function normalizeRunningPreparation(session: SessionDay): SessionDay {
  if (!isTrackableEnduranceRun(session)) return session;
  const fix = <
    T extends {
      name: string;
      exerciseId?: string;
      visualId?: string;
      cue?: string;
      technique?: string;
      instructionSteps?: { title: string; description: string }[];
    },
  >(
    e: T,
  ): T => {
    if (
      !/rower/i.test(e.name) ||
      !(/marsz|trucht/i.test(e.cue ?? "") || e.visualId === "bwprep:walk")
    )
      return e;
    return {
      ...e,
      name: "Marsz i lekki trucht",
      exerciseId: "easy_aerobic_run",
      technique:
        "Zacznij spokojnym marszem, potem przejdź do lekkiego truchtu. Oddychaj swobodnie.",
      instructionSteps: [
        { title: "Zacznij", description: "Idź spokojnie po równej trasie." },
        { title: "Rozgrzej się", description: "Stopniowo przejdź do lekkiego truchtu." },
        { title: "Sprawdź", description: "Utrzymuj swobodny oddech i możliwość rozmowy." },
      ],
    };
  };
  return {
    ...session,
    sections: { ...session.sections, warmup: session.sections.warmup.map(fix) },
    structuredSections: session.structuredSections?.map((s) =>
      s.type === "warmup" || s.type === "prep"
        ? { ...s, blocks: s.blocks.map((b) => ({ ...b, exercises: b.exercises.map(fix) })) }
        : s,
    ),
  };
}
