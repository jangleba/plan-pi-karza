// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExerciseAnimationPreview } from "./ExerciseAnimationPreview";
import type { TrainingExercise } from "@/lib/loadwise/types";

let host: HTMLDivElement; let root: Root;
const exercise = (exerciseId: string, extra: Partial<TrainingExercise> = {}): TrainingExercise => ({ id: "row", exerciseId, name: "Ćwiczenie", ...extra });
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function click(label: string) {
  const button = [...host.querySelectorAll("button")].find(b => b.textContent?.trim() === label || b.getAttribute("aria-label") === label);
  if (!button) throw new Error(`Missing ${label}`);
  await act(async () => button.click());
}
describe("exercise animation integration", () => {
  it("does not load a player until requested and closes it completely", async () => {
    await act(async () => root.render(<ExerciseAnimationPreview exercise={exercise("a_skip")} />));
    expect(host.querySelector("iframe")).toBeNull();
    await click("Pokaż animację ruchu");
    const frame = host.querySelector("iframe")!;
    expect(frame.getAttribute("src")).toBe("/technique/animations/index.html?id=a_skip&embed=1&v=2026.10.30.19");
    expect(frame.title).toContain("Ćwiczenie");
    await click("Zamknij animację"); expect(host.querySelector("iframe")).toBeNull();
  });
  it("requires choosing the session rhythm instead of silently playing add-step", async () => {
    await act(async () => root.render(<ExerciseAnimationPreview exercise={exercise("a_skip_add_step")} />));
    expect(host.querySelector<HTMLButtonElement>(".bw-animation-open")?.disabled).toBe(true);
    const select = host.querySelector("select")!;
    await act(async () => { select.value = "review:a_skip:gather"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await click("Pokaż animację ruchu");
    expect(host.querySelector("iframe")?.getAttribute("src")).toContain("review%3Aa_skip%3Agather");
  });
  it("discards the old exercise player when the exercise changes", async () => {
    await act(async () => root.render(<ExerciseAnimationPreview exercise={exercise("a_skip")} />)); await click("Pokaż animację ruchu");
    await act(async () => root.render(<ExerciseAnimationPreview exercise={exercise("b_skip", { id: "next" })} />));
    expect(host.querySelector("iframe")).toBeNull();
    await click("Pokaż animację ruchu"); expect(host.querySelector("iframe")?.getAttribute("src")).toContain("id=b_skip");
  });
  it("provides the full library and does not invent an animation for unknown exercises", async () => {
    await act(async () => root.render(<ExerciseAnimationPreview exercise={exercise("a_skip")} />)); await click("Biblioteka animacji");
    expect(host.querySelector("iframe")?.getAttribute("src")).toContain("catalog=1");
    await act(async () => root.render(<ExerciseAnimationPreview exercise={exercise("unlisted", { name: "Nieznany ruch" })} />));
    expect(host.querySelector("iframe")).toBeNull(); expect(host.textContent).toBe("");
  });
  it("ignores resize messages from other windows and origins", async () => {
    await act(async () => root.render(<ExerciseAnimationPreview exercise={exercise("a_skip")} />)); await click("Pokaż animację ruchu");
    const frame = host.querySelector("iframe")!;
    await act(async () => window.dispatchEvent(new MessageEvent("message", { origin: "https://unrelated.example", source: frame.contentWindow, data: { type: "ballwise-animation-height", height: 900 } })));
    expect(frame.style.height).toBe("620px");
  });
});
