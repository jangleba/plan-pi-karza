import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { SessionDay } from "./types";

vi.mock("@/lib/loadwise/store", () => ({
  useLoadwise: () => ({
    state: { completions: {} },
    completeSession: vi.fn(async () => {}),
  }),
}));

import { ClubMonitoring, CompletionPanel } from "@/routes/sesja.$date";

function clubSession(): SessionDay {
  return {
    dbId: "s1",
    date: "2026-08-17",
    dayName: "Poniedziałek",
    dayType: "club",
    title: "Trening klubowy",
    goalLabel: "",
    intensity: "umiarkowana",
    durationMin: 75,
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
  } as SessionDay;
}

describe("club monitoring/completion rendering", () => {
  it("renders one canonical monitoring/completion form with RPE, pain, leg-fatigue and notes", () => {
    const html = renderToStaticMarkup(
      <>
        <ClubMonitoring />
        <CompletionPanel session={clubSession()} />
      </>,
    );

    expect(html).not.toContain("Wpisz RPE po treningu");
    expect((html.match(/RPE \(ciężkość\) 0–10/g) ?? []).length).toBe(1);
    expect(html).toContain("Zmęczenie nóg 0–10");
    expect(html).toContain("Ból 0–10");
    expect(html).toContain("Notatki po treningu");
  });
});
