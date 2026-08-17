import { describe, expect, it } from "vitest";
import type { SessionDay } from "./types";
import { detailDecisionNote, detailStatusLabel } from "./sessionDetailsView";

function clubDay(overrides: Partial<SessionDay> = {}): SessionDay {
  return {
    date: "2026-08-17",
    dayName: "Poniedziałek",
    dayType: "club",
    title: "Trening klubowy",
    goalLabel: "",
    intensity: "umiarkowana",
    durationMin: 75,
    reason: "",
    safetyNote:
      "Niska gotowość — zgłoś ją trenerowi przed treningiem i ogranicz obciążenie zgodnie z jego decyzją. Przerwij wysiłek, jeśli pojawi się lub nasili ból.",
    whyToday: "",
    sessionType: "Klub",
    goalOfSession: "",
    riskManaged: "",
    avoidToday: "",
    mdLabel: null,
    slotLabel: null,
    sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
    secondSession: null,
    ...overrides,
  } as SessionDay;
}

describe("session details view model", () => {
  it("shows adapted status label for club low-readiness day", () => {
    const session = clubDay({ loadLabelOverride: "Ogranicz obciążenie" });
    expect(detailStatusLabel(session)).toBe("Ogranicz obciążenie");
    expect(detailStatusLabel(session)).not.toBe("umiarkowana");
  });

  it("shows full low-readiness safety warning text", () => {
    const session = clubDay({ loadLabelOverride: "Ogranicz obciążenie" });
    expect(detailDecisionNote(session)).toBe(
      "Niska gotowość — zgłoś ją trenerowi przed treningiem i ogranicz obciążenie zgodnie z jego decyzją. Przerwij wysiłek, jeśli pojawi się lub nasili ból.",
    );
  });
});
