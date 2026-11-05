import { APP_VERSION } from "@/lib/appVersion";
// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExerciseAnimationPreview } from "./ExerciseAnimationPreview";
import type { TrainingExercise } from "@/lib/loadwise/types";

let host: HTMLDivElement;
let root: Root;
const exercise = (exerciseId: string, extra: Partial<TrainingExercise> = {}): TrainingExercise => ({
  id: "row",
  exerciseId,
  name: "Ćwiczenie",
  ...extra,
});
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function click(label: string) {
  const button = [...host.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label || b.getAttribute("aria-label") === label,
  );
  if (!button) throw new Error(`Missing ${label}`);
  await act(async () => button.click());
}
describe("exercise animation integration", () => {
  it("passes the saved tempo, hold time and explicit box variant to the shared player", async () => {
    await act(async () =>
      root.render(
        <ExerciseAnimationPreview
          exercise={exercise("heavy_back_squat", {
            tempo: "3–0–1–0",
            animationVariant: "box_touch",
          })}
          autoOpen
        />,
      ),
    );
    let query = new URL(host.querySelector("iframe")!.src).searchParams;
    expect(query.get("tempo")).toBe("3–0–1–0");
    expect(query.get("variant")).toBe("box_touch");
    await act(async () =>
      root.render(
        <ExerciseAnimationPreview
          exercise={exercise("plank", { duration: "30 s / stronę" })}
          autoOpen
        />,
      ),
    );
    query = new URL(host.querySelector("iframe")!.src).searchParams;
    expect(query.get("hold")).toBe("30");
    await act(async () =>
      root.render(
        <ExerciseAnimationPreview exercise={exercise("plank", { duration: "20–30 s" })} autoOpen />,
      ),
    );
    query = new URL(host.querySelector("iframe")!.src).searchParams;
    expect(query.has("hold")).toBe(false);
  });
  it("does not load a player until requested and closes it completely", async () => {
    await act(async () => root.render(<ExerciseAnimationPreview exercise={exercise("a_skip")} />));
    expect(host.querySelector("iframe")).toBeNull();
    await click("Pokaż animację ruchu");
    const frame = host.querySelector("iframe")!;
    expect(frame.getAttribute("src")).toBe(
      `/technique/animations/index.html?id=a_skip&embed=1&autoplay=1&v=${APP_VERSION}`,
    );
    expect(frame.title).toContain("Ćwiczenie");
    await click("Zamknij animację");
    expect(host.querySelector("iframe")).toBeNull();
  });
  it("opens the compact player immediately for an expanded exercise, preserving explicit variant selection", async () => {
    await act(async () =>
      root.render(<ExerciseAnimationPreview exercise={exercise("a_skip")} autoOpen />),
    );
    expect(host.querySelector("iframe")?.getAttribute("src")).toContain("&compact=1");
    await act(async () =>
      root.render(<ExerciseAnimationPreview exercise={exercise("a_skip_add_step")} autoOpen />),
    );
    expect(host.querySelector("iframe")).toBeNull();
    const select = host.querySelector("select")!;
    await act(async () => {
      select.value = "review:a_skip:gather";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(host.querySelector("iframe")?.getAttribute("src")).toContain("review%3Aa_skip%3Agather");
  });
  it("requires choosing the session rhythm instead of silently playing add-step", async () => {
    await act(async () =>
      root.render(<ExerciseAnimationPreview exercise={exercise("a_skip_add_step")} />),
    );
    expect(host.querySelector<HTMLButtonElement>(".bw-animation-open")?.disabled).toBe(true);
    const select = host.querySelector("select")!;
    await act(async () => {
      select.value = "review:a_skip:gather";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await click("Pokaż animację ruchu");
    expect(host.querySelector("iframe")?.getAttribute("src")).toContain("review%3Aa_skip%3Agather");
  });
  it("discards the old exercise player when the exercise changes", async () => {
    await act(async () => root.render(<ExerciseAnimationPreview exercise={exercise("a_skip")} />));
    await click("Pokaż animację ruchu");
    await act(async () =>
      root.render(<ExerciseAnimationPreview exercise={exercise("b_skip", { id: "next" })} />),
    );
    expect(host.querySelector("iframe")).toBeNull();
    await click("Pokaż animację ruchu");
    expect(host.querySelector("iframe")?.getAttribute("src")).toContain("id=b_skip");
  });
  it("provides the full library and does not invent an animation for unknown exercises", async () => {
    await act(async () => root.render(<ExerciseAnimationPreview exercise={exercise("a_skip")} />));
    await click("Biblioteka animacji");
    expect(host.querySelector("iframe")?.getAttribute("src")).toContain("catalog=1");
    await act(async () =>
      root.render(
        <ExerciseAnimationPreview exercise={exercise("unlisted", { name: "Nieznany ruch" })} />,
      ),
    );
    expect(host.querySelector("iframe")).toBeNull();
    expect(host.textContent).toBe("");
  });
  it("ignores resize messages from other windows and origins", async () => {
    await act(async () => root.render(<ExerciseAnimationPreview exercise={exercise("a_skip")} />));
    await click("Pokaż animację ruchu");
    const frame = host.querySelector("iframe")!;
    await act(async () =>
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "https://unrelated.example",
          source: frame.contentWindow,
          data: { type: "ballwise-animation-height", height: 900 },
        }),
      ),
    );
    expect(frame.style.height).toBe("620px");
  });
});
