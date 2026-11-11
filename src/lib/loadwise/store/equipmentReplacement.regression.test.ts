import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPlanActions } from "./planActions";
import { initialState, type StoreActionContext } from "./model";
import type { LoadwiseState, SessionCompletion, SessionDay, TrainingExercise } from "../types";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(async () => ({ data: null, error: null })) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc, from: () => ({}) },
}));
vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

const exercise = (id: string): TrainingExercise =>
  ({
    id,
    exerciseId: "barbell_deadlift",
    name: "Martwy ciąg klasyczny",
    sets: "4",
    reps: "5",
  }) as TrainingExercise;

const day = (dbId: string): SessionDay =>
  ({
    date: "2026-11-12",
    dayName: "czwartek",
    dayType: "training",
    dbId,
    title: "Siła",
    sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
    structuredSections: [
      {
        id: "main",
        title: "Główna",
        type: "main",
        blocks: [
          {
            id: "b",
            title: "",
            blockType: "single",
            intent: "strength",
            exercises: [exercise("ex-1")],
          },
        ],
      },
    ],
    secondSession: null,
    durationMin: 60,
    intensity: "wysoka",
    reason: "",
    whyToday: "",
    goalOfSession: "",
    riskManaged: "",
    avoidToday: "",
    sessionType: "Siła",
    mdLabel: null,
    slotLabel: null,
  }) as unknown as SessionDay;

function harness(plan: SessionDay[], completions: Record<string, SessionCompletion>) {
  let state: LoadwiseState = {
    ...initialState,
    user: { id: "u" } as never,
    profile: { id: "u" } as never,
    plan,
    completions,
  } as LoadwiseState;
  const actions = createPlanActions({
    user: { id: "u" },
    state,
    todayIso: "2026-11-10",
    setState: (update: Parameters<StoreActionContext["setState"]>[0]) => {
      state = typeof update === "function" ? update(state) : update;
    },
    replacementInFlightRef: { current: new Set() },
  } as unknown as Parameters<typeof createPlanActions>[0]);
  return {
    actions,
    get state() {
      return state;
    },
  };
}

describe("zamiennik sprzętu nie zmienia rozpoczętej ani wykonanej sesji", () => {
  beforeEach(() => mocks.rpc.mockClear());

  it("sesja rozpoczęta: zapis nie jest wysyłany, a użytkownik dostaje informację", async () => {
    const h = harness([day("s1")], {
      s1: { completed: false, status: "started", rpe: null, notes: "" } as SessionCompletion,
    });
    await h.actions.markEquipmentUnavailable("2026-11-12", exercise("ex-1"), ["barbell"]);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(h.state.equipmentNotice).toMatch(/rozpoczęta lub wykonana/);
  });

  it("sesja w toku zabezpieczona (executionProtected): też bez zmian", async () => {
    const protectedDay = { ...day("s2"), executionProtected: true };
    const h = harness([protectedDay], {});
    await h.actions.markEquipmentUnavailable("2026-11-12", exercise("ex-1"), ["barbell"]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
