// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrainingSection } from "@/lib/loadwise/types";
import { FocusedSessionRunner } from "./FocusedSessionRunner";
import { sectionFixture } from "./testFixtures";

const logs = vi.hoisted(() => ({ save: vi.fn(), current: {} as Record<number, unknown> }));
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("../ExerciseRunnerScreen", () => ({ ExerciseRunnerScreen: () => null }));
vi.mock("@/lib/loadwise/store", () => ({
  useLoadwise: () => ({
    state: { plan: [], modifications: {}, profile: null, readiness: {}, completions: {} },
    todayIso: "2026-11-10",
  }),
}));
vi.mock("@/lib/loadwise/setLogs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/loadwise/setLogs")>()),
  useExerciseSetLogs: () => ({
    current: logs.current,
    previous: {},
    recentSessions: [],
    loading: false,
    saveSet: logs.save,
  }),
}));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.localStorage.clear();
  for (const key of Object.keys(logs.current)) delete logs.current[Number(key)];
  logs.save.mockReset().mockImplementation(async (log: { setNumber: number }) => {
    logs.current[log.setNumber] = log;
    return true;
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

const sections: TrainingSection[] = [
  sectionFixture("warmup", [
    { id: "w1", exerciseId: "ankling", name: "Ankling", sets: "1", reps: "2 × 10 m" },
    { id: "w2", name: "Wypad z rotacją", sets: "1", reps: "5 / stronę" },
  ]),
  sectionFixture("main", [
    {
      id: "m1",
      exerciseId: "glute_bridge",
      name: "Most biodrowy",
      sets: "2",
      reps: "10",
      restAfterExercise: "60 s",
    },
  ]),
];

const buttons = () => [...host.querySelectorAll<HTMLButtonElement>("button")];
const byText = (text: string) => buttons().find((b) => b.textContent?.trim() === text);
const containing = (text: string) => buttons().find((b) => b.textContent?.includes(text));
/** Progress: the exercise view names it on the segment bar, the list in its count row. */
const count = () =>
  host.querySelector(".bw-runner-segments")?.getAttribute("aria-label") ??
  host.querySelector(".bw-runner-count")?.textContent ??
  "";
/** The open exercise: above the plan view in preview, on the card during training. */
const title = () =>
  host.querySelector(".bw-unit-exercise-head h2 .bw-runner-name, .bw-runner-card .bw-runner-name")
    ?.textContent ?? undefined;
const howTo = () => byText("Jak wykonać?");
const closeHowTo = () =>
  host.querySelector<HTMLButtonElement>('button[aria-label="Zamknij instrukcję"]')!;
/** The rest takes the screen after a set; the athlete starts the next one. */
const nextSet = () => click(byText("Rozpocznij kolejną serię"));
const click = async (button: HTMLButtonElement | undefined) => act(async () => button!.click());

function runner(canRecord: boolean, onStart = vi.fn()) {
  return (
    <FocusedSessionRunner
      sections={sections}
      date="2026-11-10"
      kind="general"
      canRecord={canRecord}
      onFinish={() => undefined}
      start={{ label: "Rozpocznij trening", busy: false, error: null, onStart }}
    />
  );
}

async function render(canRecord: boolean, onStart = vi.fn()) {
  await act(async () => root.render(runner(canRecord, onStart)));
}

async function saveFirstSet() {
  const reps = host.querySelector<HTMLInputElement>('input[aria-label="Seria 1: powtórzenia"]');
  expect(reps).not.toBeNull();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(reps, "10");
    reps!.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click(host.querySelector<HTMLButtonElement>('button[aria-label="Zatwierdź serię 1"]')!);
  expect(logs.save).toHaveBeenCalledTimes(1);
}

describe("ekran treningu", () => {
  it("po trzecim wysiłku ISO odlicza pełne 300 s, zachowując 60 s między próbami", async () => {
    let now = new Date("2026-11-10T12:00:00Z").getTime();
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    const advance = async (milliseconds: number) => {
      now += milliseconds;
      await act(async () => {
        window.dispatchEvent(new Event("focus"));
      });
    };
    const isoSections: TrainingSection[] = [
      sectionFixture("prep", [
        {
          id: "iso-primer",
          exerciseId: "overcoming_pin_squat_primer",
          name: "Nadzorowany nacisk izometryczny",
          sets: "3",
          duration: "3 s",
          displayPrescription: "3 × 3 s",
          restAfterExercise: "60 s",
          engineDose: {
            sets: 3,
            seconds: 3,
            restSeconds: 60,
            postRestSeconds: 300,
            jointAngleDegrees: 90,
            intent: "explosive",
          },
        },
      ]),
      sectionFixture("main", [
        {
          id: "next-lift",
          exerciseId: "glute_bridge",
          name: "Most biodrowy",
          sets: "2",
          reps: "8",
          restAfterExercise: "60 s",
        },
      ]),
    ];
    try {
      await act(async () =>
        root.render(
          <FocusedSessionRunner
            sections={isoSections}
            date="2026-11-10"
            kind="strength"
            canRecord
            onFinish={() => undefined}
          />,
        ),
      );
      for (let repetition = 0; repetition < 3; repetition++) {
        expect(byText("Start 0:03")).toBeDefined();
        await click(byText("Start 0:03"));
        expect(host.querySelector(".bw-work-clock")?.textContent).toBe("0:03");
        await advance(3000);
        expect(host.querySelector(".bw-work-clock")?.textContent).toBe("0:00");
        expect(count()).toContain("Wykonane 0 z 2");
        await click(repetition < 2 ? byText("Seria wykonana") : containing("Wykonane · dalej"));
        expect(host.querySelector(".bw-rest-big")?.textContent).toBe(
          repetition < 2 ? "01:00" : "05:00",
        );
        if (repetition < 2) {
          await advance(60000);
          await nextSet();
        }
      }
      expect(count()).toContain("Wykonane 1 z 2");
      expect(host.querySelector(".bw-rest-following")?.textContent).toContain("Most biodrowy");
      expect(byText("Rozpocznij ćwiczenie")).toBeDefined();
    } finally {
      clock.mockRestore();
    }
  });

  it("po ostatniej serii A zachowuje 180 s przed nieukończoną częścią B kontrastu", async () => {
    const contrast: TrainingSection[] = [
      {
        id: "contrast-main",
        title: "Część główna",
        type: "main",
        blocks: [
          {
            id: "pair",
            title: "Para",
            blockType: "contrast",
            intent: "power",
            exercises: [
              {
                id: "contrast-a",
                label: "A1",
                exerciseId: "heavy_back_squat",
                name: "Przysiad ze sztangą",
                sets: "3",
                reps: "4",
                rir: "2",
                restAfterExercise: "180 s",
              },
              {
                id: "contrast-b",
                label: "A2",
                exerciseId: "countermovement_jump",
                name: "Skok z zamachem",
                sets: "3",
                reps: "3",
                restAfterExercise: "180 s",
                restAfterPair: "180 s",
              },
            ],
          },
          {
            id: "after-pair",
            title: "Dalej",
            blockType: "single",
            intent: "strength",
            exercises: [
              {
                id: "after-pair-ex",
                exerciseId: "glute_bridge",
                name: "Most biodrowy",
                sets: "2",
                reps: "8",
              },
            ],
          },
        ],
      },
    ];
    await act(async () =>
      root.render(
        <FocusedSessionRunner
          sections={contrast}
          date="2026-11-10"
          kind="strength"
          canRecord
          onFinish={() => undefined}
        />,
      ),
    );
    for (let set = 1; set <= 3; set++) {
      expect(host.querySelector(".bw-rest-screen")).toBeNull();
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
        for (const [field, value] of [
          ["ciężar w kg", "80"],
          ["powtórzenia", "4"],
        ]) {
          const input = host.querySelector<HTMLInputElement>(
            `input[aria-label="Seria ${set}: ${field}"]`,
          );
          expect(input).not.toBeNull();
          setter.call(input, value);
          input!.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
      await click(
        host.querySelector<HTMLButtonElement>(`button[aria-label="Seria ${set}: zapas 2"]`)!,
      );
      await click(
        host.querySelector<HTMLButtonElement>(`button[aria-label="Zatwierdź serię ${set}"]`)!,
      );
      expect(host.querySelector(".bw-rest-screen")).not.toBeNull();
      expect(host.querySelector(".bw-rest-big")?.textContent).toBe("03:00");
      if (set < 3) await nextSet();
    }
    expect(logs.save).toHaveBeenCalledTimes(3);
    expect(count()).toContain("Wykonane 1 z 3");
    expect(host.querySelector(".bw-rest-following")?.textContent).toContain("Skok z zamachem");
    expect(byText("Rozpocznij ćwiczenie")).toBeDefined();
  });

  it("zapis serii: kolejna seria jest wypełniona, krokiem dodaje się powtórzenie, zapisaną można poprawić", async () => {
    await render(true);
    await click(byText("Następne"));
    await click(byText("Następne"));
    await saveFirstSet();
    expect(host.querySelector(".bw-rest-screen")?.textContent).toContain("Następnie: seria 2 z 2");
    expect(host.querySelector(".bw-rest-screen")?.textContent).toContain("10 powt.");
    await nextSet();
    expect(host.querySelector(".bw-rest-screen")).toBeNull();
    const reps2 = () =>
      host.querySelector<HTMLInputElement>('input[aria-label="Seria 2: powtórzenia"]')!;
    expect(reps2().value).toBe("10");
    await click(
      host.querySelector<HTMLButtonElement>('button[aria-label="Seria 2: powtórzenia: więcej"]')!,
    );
    expect(reps2().value).toBe("11");
    await click(
      host.querySelector<HTMLButtonElement>('button[aria-label="Seria 1 zapisana, popraw"]')!,
    );
    expect(host.querySelector('button[aria-label="Zapisz poprawkę serii 1"]')).not.toBeNull();
    await click(byText("Anuluj"));
    expect(host.querySelector('button[aria-label="Zatwierdź serię 2"]')).not.toBeNull();
  });

  it("start z podglądu ćwiczenia otwiera trening na tym ćwiczeniu", async () => {
    const onStart = vi.fn();
    await render(false, onStart);
    await click(containing("Most biodrowy"));
    await click(byText("Rozpocznij trening"));
    expect(onStart).toHaveBeenCalledOnce();
    await render(true);
    expect(title()).toBe("Most biodrowy");
  });

  it("podgląd: płaska lista z dawkami, bez pól wpisu, jedna główna akcja startu", async () => {
    const onStart = vi.fn();
    await render(false, onStart);
    expect(host.querySelector("input")).toBeNull();
    expect(host.querySelector("details")).toBeNull();
    expect(host.textContent).not.toMatch(/będzie dostępny po rozpoczęciu/);
    expect(host.querySelectorAll(".bw-rplan-row")).toHaveLength(3);
    expect(host.querySelector(".bw-rplan-row small")?.textContent).toBeTruthy();
    expect(host.querySelector("iframe")).toBeNull();
    await click(byText("Rozpocznij trening"));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it("podgląd: wybranie ćwiczenia pokazuje plan i „Jak wykonać?”; animacja tylko po otwarciu", async () => {
    await render(false);
    await click(containing("Most biodrowy"));
    expect(title()).toBe("Most biodrowy");
    expect(host.querySelector(".bw-runner-facts")?.textContent).toContain("Odpoczynek60 s");
    expect(host.querySelector("input")).toBeNull();
    expect(host.querySelector("iframe")).toBeNull();
    expect(host.querySelector(".bw-howto-panel")).toBeNull();
    await click(howTo());
    expect(host.querySelector(".bw-howto-panel")).not.toBeNull();
    await click(closeHowTo());
    expect(host.querySelector(".bw-howto-panel")).toBeNull();
    expect(host.querySelector("iframe")).toBeNull();
    await click(containing("Lista ćwiczeń"));
    expect(host.querySelectorAll(".bw-rplan-row")).toHaveLength(3);
    // Start is reachable from the exercise view too.
    expect(byText("Rozpocznij trening")).toBeDefined();
  });

  it("start prowadzi do rozgrzewki; przejście dalej i pominięcie nie oznaczają wykonania", async () => {
    await render(true);
    expect(title()).toBe("Ankling");
    await click(byText("Pomiń"));
    expect(count()).toContain("Wykonane 0 z 3");
    expect(count()).toContain("pominięte 1");
    expect(title()).toBe("Wypad z rotacją");
    await click(byText("Następne"));
    expect(title()).toBe("Most biodrowy");
    expect(count()).toContain("Wykonane 0 z 3");
    // Pominięte można przywrócić.
    await click(byText("Poprzednie"));
    await click(byText("Poprzednie"));
    await click(byText("Wróć do ćwiczenia"));
    expect(count()).not.toContain("pominięte");
  });

  it("lista w trakcie: status, „Teraz” i powrót do ćwiczenia jednym dotknięciem", async () => {
    await render(true);
    await click(byText("Pomiń"));
    await click(byText("Pozostałe ćwiczenia"));
    expect(title()).toBeUndefined();
    const marks = [...host.querySelectorAll(".bw-rplan-mark")].map((m) =>
      m.getAttribute("data-state"),
    );
    expect(marks).toEqual(["skipped", "open", "open"]);
    expect(host.querySelector(".bw-rplan-now")?.closest(".bw-rplan-row")?.textContent).toContain(
      "Wypad z rotacją",
    );
    await click(containing("Kontynuuj: Wypad z rotacją"));
    expect(title()).toBe("Wypad z rotacją");
    await click(byText("Pozostałe ćwiczenia"));
    await click(containing("Most biodrowy"));
    expect(title()).toBe("Most biodrowy");
  });

  it("jednostronne ćwiczenie: lewa, potem prawa; podwójne kliknięcie nie zapisuje dwa razy", async () => {
    await render(true);
    await click(byText("Następne"));
    expect(title()).toBe("Wypad z rotacją");
    expect(host.querySelector(".bw-bouts")?.textContent).toContain("Lewa");
    await click(byText("Lewa wykonana"));
    expect(count()).toContain("Wykonane 0 z 3");
    const last = buttons().find((b) => b.textContent?.startsWith("Prawa wykonana"))!;
    await act(async () => {
      last.click();
      last.click();
    });
    expect(count()).toContain("Wykonane 1 z 3");
  });

  it("„Jak wykonać?” w przerwie zachowuje zapisane serie i odliczanie przerwy", async () => {
    await render(true);
    await click(byText("Następne"));
    await click(byText("Następne"));
    expect(title()).toBe("Most biodrowy");
    await saveFirstSet();
    expect(host.querySelector(".bw-rest-screen")).not.toBeNull();
    await click(howTo());
    expect(host.querySelector(".bw-howto-panel")).not.toBeNull();
    expect(host.querySelector('input[aria-label="Seria 2: powtórzenia"]')).toBeNull();
    await click(closeHowTo());
    expect(host.querySelector(".bw-rest-screen")).not.toBeNull();
    expect(count()).toContain("Wykonane 0 z 3");
    await nextSet();
    expect(title()).toBe("Most biodrowy");
    expect(host.querySelector('button[aria-label="Seria 1 zapisana, popraw"]')).not.toBeNull();
  });

  it("przerwa: −15 s i +15 s zmieniają czas, „Zakończ ćwiczenie” oznacza je i przechodzi dalej", async () => {
    await render(true);
    await click(byText("Następne"));
    await click(byText("Następne"));
    await saveFirstSet();
    const clock = () => host.querySelector(".bw-rest-big")?.textContent;
    expect(clock()).toBe("01:00");
    await click(byText("−15 s"));
    expect(clock()).toBe("00:45");
    await click(byText("+15 s"));
    expect(clock()).toBe("01:00");
    await click(byText("Zakończ ćwiczenie"));
    expect(count()).toContain("Wykonane 1 z 3");
  });

  it("zamknięcie i ponowne otwarcie panelu wraca do tego samego ćwiczenia z serią i przerwą", async () => {
    await render(true);
    await click(byText("Następne"));
    await click(byText("Następne"));
    await saveFirstSet();
    const restBefore = host.querySelector(".bw-rest-big")?.textContent;
    expect(restBefore).toBeTruthy();
    // Closing the panel unmounts the runner.
    await act(async () => root.render(<div />));
    expect(host.querySelector(".bw-runner")).toBeNull();
    await act(async () => root.render(runner(true)));
    // The rest keeps counting to its end time.
    expect(host.querySelector(".bw-rest-screen")).not.toBeNull();
    expect(host.querySelector(".bw-rest-big")?.textContent).toBe(restBefore);
    await nextSet();
    expect(title()).toBe("Most biodrowy");
    expect(host.querySelector('button[aria-label="Seria 1 zapisana, popraw"]')).not.toBeNull();
    // The list view is remembered as well.
    await click(byText("Pozostałe ćwiczenia"));
    await act(async () => root.render(<div />));
    await act(async () => root.render(runner(true)));
    expect(title()).toBeUndefined();
  });
});
