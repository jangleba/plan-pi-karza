// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseSetup, courseSetupDistances } from "./CourseSetup";

const native = vi.hoisted(() => ({ supported: true, measure: vi.fn() }));
vi.mock("@/lib/courseMeasure/native", () => ({
  supportsNativeCourseMeasure: () => native.supported,
  measureCourse: native.measure,
  courseMeasureError: () => "Pomiar niedostępny",
}));
vi.mock("@/components/football/TrainingFieldBoard", () => ({ TrainingFieldBoard: () => null }));

describe("course setup reads the actual planned geometry", () => {
  it("keeps a 40 m physical course without replacing it by the camera's 20 m default", () => {
    expect(courseSetupDistances([{ displayPrescription: "3 × 40 m" }])).toEqual([40]);
  });
  it("keeps measured and run-in segments separate rather than inventing a summed distance", () => {
    expect(courseSetupDistances([{ engineDose: { distanceM: 10, runInM: 20 } } as never])).toEqual([
      10, 20,
    ]);
    expect(courseSetupDistances([{ displayPrescription: "3 × 10–20 m" }])).toEqual([]);
    expect(courseSetupDistances([{ displayPrescription: "20 + 10 m" }])).toEqual([]);
  });
  it("uses the 5 m leg of the known 5-0-5 instead of placing the turn line 10 m away", () => {
    expect(
      courseSetupDistances([{ exerciseId: "planned_505", displayPrescription: "3 × 10 m" }]),
    ).toEqual([5]);
    expect(
      courseSetupDistances([
        {
          exerciseId: "planned_505",
          engineDose: { sets: 4, distanceM: 10, runOutM: 5, restSeconds: 90, intent: "controlled" },
        },
      ]),
    ).toEqual([5]);
  });
  it("does not turn the total work distance of a cut or compound drill into one measured leg", () => {
    for (const exerciseId of [
      "planned_cut",
      "cut_and_reaccelerate",
      "deceleration_lateral_exit",
      "reactive_180_turn",
      "accel_decel_reaccel",
    ])
      expect(
        courseSetupDistances([{ exerciseId, engineDose: { distanceM: 10 } } as never]),
      ).toEqual([]);
    expect(
      courseSetupDistances([{ exerciseId: "planned_505", displayPrescription: "3 × 20 m" }]),
    ).toEqual([]);
  });
});

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  native.supported = true;
  native.measure.mockReset().mockResolvedValue({
    targetMeters: 20,
    measuredMeters: 20.1,
    method: "arkit",
    approximate: true,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("does not call the 30 m camera protocol for a valid 40 m physical course", async () => {
  await act(async () =>
    root.render(<CourseSetup exercises={[{ displayPrescription: "3 × 40 m" }]} />),
  );
  expect(host.querySelector("input")?.value).toBe("40");
  const measure = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === "Wyznacz kamerą",
  )!;
  expect(measure.disabled).toBe(true);
  expect(host.textContent).toContain("Ten dystans odmierz taśmą");
  await act(async () => measure.click());
  expect(native.measure).not.toHaveBeenCalled();
});

it("offers the existing camera tool only after an explicit request for a supported segment", async () => {
  await act(async () =>
    root.render(<CourseSetup exercises={[{ displayPrescription: "3 × 20 m" }]} />),
  );
  expect(native.measure).not.toHaveBeenCalled();
  const measure = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === "Wyznacz kamerą",
  )!;
  await act(async () => measure.click());
  expect(native.measure).toHaveBeenCalledExactlyOnceWith(20);
  expect(host.querySelector('[role="status"]')?.textContent).toContain("20,1");
});

it("keeps the web setup to the diagram and a tape instruction without camera inputs or chips", async () => {
  native.supported = false;
  await act(async () =>
    root.render(<CourseSetup exercises={[{ displayPrescription: "3 × 20 m" }]} />),
  );
  expect(host.querySelector("input, .bw-course-camera")).toBeNull();
  expect(host.querySelectorAll("button")).toHaveLength(0);
  expect(host.textContent).toContain("Odmierz odległości taśmą");
});

it("requires the native measuring target to name one component of a cut, not its total work", async () => {
  await act(async () =>
    root.render(
      <CourseSetup
        exercises={[{ exerciseId: "planned_cut", engineDose: { distanceM: 10 } } as never]}
      />,
    ),
  );
  expect(host.querySelector("input")?.value).toBe("");
  expect(host.querySelector("label")?.textContent).toContain("Dystans jednej części");
  expect(host.textContent).toContain("Dystans z planu jest sumą części");
  const measure = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Wyznacz kamerą",
  )!;
  expect(measure.disabled).toBe(true);
  expect(native.measure).not.toHaveBeenCalled();
});

it("uses 5 m as the native target for a real 5-0-5 dose with a separate 5 m run-out", async () => {
  await act(async () =>
    root.render(
      <CourseSetup
        exercises={[
          {
            exerciseId: "planned_505",
            engineDose: {
              sets: 4,
              distanceM: 10,
              runOutM: 5,
              restSeconds: 90,
              intent: "controlled",
            },
          },
        ]}
      />,
    ),
  );
  expect(host.querySelector("input")?.value).toBe("5");
  expect(host.textContent).toContain("5 m od startu do linii zwrotu");
  expect(host.textContent).toContain("Bieg tam i z powrotem daje 10 m pracy");
  const measure = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Wyznacz kamerą",
  )!;
  await act(async () => measure.click());
  expect(native.measure).toHaveBeenCalledExactlyOnceWith(5);
});

it("switches to the new course and ignores a camera result from the previous prescription", async () => {
  let finish!: (value: unknown) => void;
  native.measure.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await act(async () =>
    root.render(<CourseSetup exercises={[{ id: "sprint", displayPrescription: "3 × 20 m" }]} />),
  );
  const measure = () =>
    [...host.querySelectorAll("button")].find((button) => button.textContent === "Wyznacz kamerą")!;
  await act(async () => measure().click());
  expect(native.measure).toHaveBeenCalledExactlyOnceWith(20);

  await act(async () =>
    root.render(<CourseSetup exercises={[{ id: "sprint", displayPrescription: "3 × 10 m" }]} />),
  );
  expect(host.querySelector("input")?.value).toBe("10");
  expect(measure().disabled).toBe(false);
  await act(async () =>
    finish({ targetMeters: 20, measuredMeters: 20.1, method: "arkit", approximate: true }),
  );
  expect(host.querySelector("input")?.value).toBe("10");
  expect(host.querySelector('[role="status"]')).toBeNull();
});

it("preserves an edited measuring target when only the parent renders the same course again", async () => {
  const render = () =>
    act(async () =>
      root.render(<CourseSetup exercises={[{ id: "sprint", displayPrescription: "3 × 20 m" }]} />),
    );
  await render();
  await act(async () => {
    const input = host.querySelector("input")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "12");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await render();
  expect(host.querySelector("input")?.value).toBe("12");
});
