import { describe, expect, it } from "vitest";
import type { SessionDay } from "@/lib/loadwise/types";
import {
  postSessionFormCount,
  shortDecisionNote,
  statusBadgeLabel,
} from "./sesja.$date";

function baseSession(overrides: Partial<SessionDay> = {}): SessionDay {
  return {
    date: "2026-08-17",
    dayName: "Poniedziałek",
    dayType: "club",
    title: "Trening klubowy",
    goalLabel: "",
    intensity: "umiarkowana",
    durationMin: 90,
    reason: "",
    safetyNote: null,
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

describe("sesja details view-model", () => {
  it("pokazuje współdzielony status adaptacji zamiast surowej intensywności", () => {
    const session = baseSession({ loadLabelOverride: "Ogranicz obciążenie" });
    expect(statusBadgeLabel(session)).toBe("Ogranicz obciążenie");
  });

  it("pokazuje pełne ostrzeżenie bezpieczeństwa dla niskiej gotowości", () => {
    const fullWarning =
      "Niska gotowość — zgłoś ją trenerowi przed treningiem i ogranicz obciążenie zgodnie z jego decyzją. Przerwij wysiłek, jeśli pojawi się lub nasili ból.";
    const session = baseSession({
      loadLabelOverride: "Ogranicz obciążenie",
      safetyNote: fullWarning,
    });
    expect(shortDecisionNote(session)).toBe(fullWarning);
  });

  it("renderuje dokładnie jeden kanoniczny formularz completion/monitoring", () => {
    const session = baseSession({ dbId: "session-1" });
    expect(postSessionFormCount(session)).toBe(1);
  });
});
