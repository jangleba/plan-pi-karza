// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrainingExercise } from "@/lib/loadwise/types";
import { ExerciseQuickGuide } from "./ExerciseQuickGuide";
import { kneeAngle, TECHNIQUE_POSES } from "./TechniqueJointGuide";

const mocks = vi.hoisted(() => ({ coach: vi.fn() }));
vi.mock("./ExerciseCoach", () => ({ ExerciseCoach: () => { mocks.coach(); return <p>Panel pytań</p>; } }));
let host: HTMLDivElement;
let root: Root;
const exercise = (exerciseId: string): TrainingExercise => ({ id: `session-${exerciseId}`, name: exerciseId, exerciseId });
async function click(label: string) {
  const button = [...host.querySelectorAll("button")].find(item => item.textContent?.trim() === label);
  if (!button) throw new Error(`Missing control: ${label}`);
  await act(async () => button.click());
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.coach.mockReset();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("visible exercise technique guidance", () => {
  it("keeps a visible hint even for a saved exercise without library instructions", async () => {
    await act(async () => root.render(<ExerciseQuickGuide exercise={{ id: "old", name: "Własne ćwiczenie" }} />));
    expect(host.querySelector(".bw-technique-reminder")?.textContent).toBeTruthy();
    await click("Pełna instrukcja ćwiczenia");
    expect(host.textContent).toContain("Wykonaj wariant i dawkę zapisane w planie");
    expect(host.querySelector("svg[role=img]")).toBeNull();
  });
  it("switches phase-specific knee cues and the angle annotation with one tap", async () => {
    await act(async () => root.render(<ExerciseQuickGuide exercise={exercise("b_skip")} />));
    await click("Technika i ustawienie stawów");
    expect(host.querySelector(".bw-joint-figure figcaption")?.textContent).toContain("≈90°");
    await click("2. Otwarcie");
    expect(host.querySelector(".bw-joint-figure figcaption")?.textContent).not.toContain("90°");
    expect(host.querySelector(".bw-joint-figure img")?.getAttribute("src")).toContain("b-open.svg");
    expect(host.querySelector(".bw-joint-figure svg")).toBeNull();
    expect(host.querySelector(".bw-joint-notes")?.textContent).toContain("nie ma jednego obowiązkowego kąta");
    expect(host.querySelector(".bw-joint-phases button[aria-pressed=true]")?.textContent).toContain("Otwarcie");
    await click("3. Kontakt");
    expect(host.querySelector(".bw-joint-notes")?.textContent).toContain("nie próbuj utrzymać 90°");
  });
  it("preserves all session-specific steps and tempo without mounting questions until requested", async () => {
    await act(async () => root.render(<ExerciseQuickGuide exercise={{ ...exercise("goblet_squat"), tempo: "3-1-2-0",
      instructionSteps: [{ title: "Ustawienie sesji", description: "Specyficzny wariant z planu" },
        { title: "Ruch", description: "Kontrolowana próba" }, { title: "Powrót", description: "Pełna kolejność" }] }} />));
    expect(mocks.coach).not.toHaveBeenCalled();
    await click("Technika i ustawienie stawów");
    expect(host.querySelectorAll(".bw-technique-session-steps li")).toHaveLength(3);
    expect(host.textContent).toContain("3-1-2-0");
    expect(mocks.coach).not.toHaveBeenCalled();
    await click("Zapytaj o to ćwiczenie");
    expect(host.textContent).toContain("Panel pytań");
    expect(mocks.coach).toHaveBeenCalled();
  });
  it("resets expanded content and selected phase when switching to another exercise", async () => {
    await act(async () => root.render(<ExerciseQuickGuide exercise={exercise("b_skip")} />));
    await click("Technika i ustawienie stawów"); await click("2. Otwarcie");
    await act(async () => root.render(<ExerciseQuickGuide exercise={exercise("goblet_squat")} />));
    expect(host.querySelector(".bw-technique-trigger")?.getAttribute("aria-expanded")).toBe("false");
    await click("Technika i ustawienie stawów");
    expect(host.querySelector(".bw-joint-phases button[aria-pressed=true]")?.textContent).toContain("Zejście");
  });
  it("provides an explicit angle convention and traceable sources on request", async () => {
    await act(async () => root.render(<ExerciseQuickGuide exercise={exercise("a_skip")} initialExpanded />));
    await click("Jak czytać kąt · źródła");
    expect(host.querySelector(".bw-joint-sources")?.textContent).toContain("180° oznacza prostą nogę");
    expect(host.querySelector(".bw-joint-sources a")?.getAttribute("href")).toBe("https://ucalgary.ca/shred-injuries/all-sports/soccer/a-skips");
  });
});

describe("knee diagram geometry", () => {
  it("draws the labelled A-position angle at the knee between thigh and shank", () => {
    const a = TECHNIQUE_POSES["a-position"];
    expect(kneeAngle(a.hip, a.knee, a.ankle)).toBeCloseTo(90, 8);
    expect(kneeAngle([0, 0], [0, 1], [0, 2])).toBeCloseTo(180, 8);
    for (const pose of Object.values(TECHNIQUE_POSES)) {
      const angle = kneeAngle(pose.hip, pose.knee, pose.ankle);
      expect(angle).toBeGreaterThan(0); expect(angle).toBeLessThanOrEqual(180);
    }
  });
});
