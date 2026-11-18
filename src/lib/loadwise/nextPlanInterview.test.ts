import { describe, expect, it } from "vitest";
import { draftNextPlan, emptyAnswers, readNote, type InterviewAnswers } from "./nextPlanInterview";
import type { Profile } from "./types";

const profile = {
  name: "Interview athlete",
  age: 24,
  goal: "strength",
  secondaryLimiter: "speed",
  individualTrainingDays: [2, 4, 6],
  equipment: ["Hantle", "Guma oporowa", "Ławka"],
  unavailableEquipmentIds: [],
  hasGym: true,
} as unknown as Profile;
const all = (ids: string[]) => new Set(ids);
const answers = (patch: Partial<InterviewAnswers> = {}): InterviewAnswers => ({
  ...emptyAnswers(),
  ...patch,
});

describe("next plan interview", () => {
  it("defaults a new plan to full sessions without changing the profile", () => {
    const draft = draftNextPlan(profile, 75, answers(), all([]));
    expect(draft.changes).toEqual([]);
    expect(draft.profileChanged).toBe(false);
    expect(draft.minutes).toBe(75);
    expect(draft.sessionDurationMode).toBe("full");
    expect(draft.clarification).toBeNull();
  });

  it("a changed goal, days and budget are explicit changes applied only when confirmed", () => {
    const a = answers({ goal: "speed", days: [3, 5], minutes: 45 });
    const open = draftNextPlan(profile, 75, a, all([]));
    expect(open.changes.map((c) => c.id)).toEqual(["goal", "days", "minutes"]);
    expect(open.profile.goal).toBe("strength"); // not confirmed → nothing applied
    expect(open.minutes).toBe(75);
    expect(open.sessionDurationMode).toBe("full");
    const done = draftNextPlan(profile, 75, a, all(["goal", "days", "minutes"]));
    expect(done.profile.goal).toBe("speed");
    expect(done.profile.individualTrainingDays).toEqual([3, 5]);
    expect(done.minutes).toBe(45);
    expect(done.sessionDurationMode).toBe("limited");
    expect(done.changes[1].text).toContain("Wt, Cz, So → Śr, Pt");
  });

  it("a time barrier keeps full sessions until a numeric limit is explicitly chosen", () => {
    for (const currentMinutes of [30, 75]) {
      const full = draftNextPlan(
        profile,
        currentMinutes,
        answers({ barriers: ["time"] }),
        all(["minutes"]),
      );
      expect(full.minutes).toBe(currentMinutes);
      expect(full.sessionDurationMode).toBe("full");
      expect(full.changes).toEqual([]);
      expect(full.notes.join(" ")).toContain("Wybierz limit czasu");
    }
    const explicit = draftNextPlan(
      profile,
      75,
      answers({ barriers: ["time"], minutes: 90 }),
      all(["minutes"]),
    );
    expect(explicit.minutes).toBe(90);
    expect(explicit.sessionDurationMode).toBe("limited");
  });

  it("confirms even a limit equal to the compatibility minutes, and full mode ignores that number", () => {
    const limited = draftNextPlan(profile, 75, answers({ minutes: 75 }), all(["minutes"]));
    expect(limited.sessionDurationMode).toBe("limited");
    expect(limited.changes[0].text).toBe("Limit czasu na jednostkę: 75 min.");
    const full = draftNextPlan(
      profile,
      75,
      answers({ sessionDurationMode: "full", minutes: 45 }),
      all(["minutes"]),
    );
    expect(full.sessionDurationMode).toBe("full");
    expect(full.minutes).toBe(75);
    expect(full.changes).toEqual([]);
  });

  it("missing equipment excludes only what was selected; no selection asks to choose, never guesses", () => {
    const none = draftNextPlan(profile, 75, answers({ barriers: ["equipment"] }), all([]));
    expect(none.changes).toEqual([]);
    expect(none.notes.join(" ")).toContain("którego sprzętu");
    const picked = draftNextPlan(
      profile,
      75,
      answers({ barriers: ["equipment"], unavailableEquipment: ["dumbbell"] }),
      all(["equipment"]),
    );
    expect(picked.profile.unavailableEquipmentIds).toEqual(["dumbbell"]);
    expect(picked.changes[0].text).toContain("Hantle");
  });

  it("fatigue is offered but starts unchecked, because it makes the whole plan lighter", () => {
    const draft = draftNextPlan(profile, 75, answers({ barriers: ["fatigue"] }), all([]));
    expect(draft.changes[0]).toMatchObject({ id: "fatigue", defaultConfirmed: false });
    expect(draft.profile.secondaryLimiter).toBe("speed");
    expect(
      draftNextPlan(profile, 75, answers({ barriers: ["fatigue"] }), all(["fatigue"])).profile
        .secondaryLimiter,
    ).toBe("fatigue");
  });

  it("free notes act only through fixed rules and are shown for confirmation", () => {
    expect(readNote("Miałem mniej czasu po pracy").barriers.has("time")).toBe(true);
    expect(readNote("brak hantli w domu").equipmentIds).toEqual(["dumbbell"]);
    expect(readNote("nie mam siłowni").noGym).toBe(true);
    const draft = draftNextPlan(
      profile,
      75,
      answers({ notes: "Mniej czasu w tygodniu" }),
      all(["minutes"]),
    );
    expect(draft.changes).toEqual([]);
    expect(draft.sessionDurationMode).toBe("full");
    expect(draft.minutes).toBe(75);
    expect(draft.notes.join(" ")).toContain("Wybierz limit czasu");
    const gym = draftNextPlan(profile, 75, answers({ notes: "nie mam siłowni" }), all(["gym"]));
    expect(gym.profile.hasGym).toBe(false);
  });

  it("a negation covers only its own clause", () => {
    expect(readNote("Nie mam sztangi, ale mam hantle").equipmentIds).toEqual(["barbell"]);
    expect(readNote("Mam hantle. Brak ławki").equipmentIds).toEqual(["bench"]);
    expect(readNote("brak hantli oraz gumy").equipmentIds).toEqual(["dumbbell"]); // 'gumy' is its own clause start without a negation
    expect(readNote("Nie mam siłowni, ale mam hantle").noGym).toBe(true);
    expect(readNote("Nie mam siłowni, ale mam hantle").equipmentIds).not.toContain("dumbbell");
  });

  it("unclear text gets one concrete question instead of a hidden guess", () => {
    const draft = draftNextPlan(profile, 75, answers({ notes: "Było różnie" }), all([]));
    expect(draft.clarification?.options.map((o) => o.id)).toEqual([
      "time",
      "equipment",
      "goal",
      "days",
      "unrelated",
    ]);
    expect(draft.changes).toEqual([]);
    // the answer resolves it
    const asked = draftNextPlan(
      profile,
      75,
      answers({ notes: "Było różnie", noteTopic: "time" }),
      all(["minutes"]),
    );
    expect(asked.clarification).toBeNull();
    expect(asked.minutes).toBe(75);
    expect(asked.sessionDurationMode).toBe("full");
    expect(asked.notes.join(" ")).toContain("Wybierz limit czasu");
    const unrelated = draftNextPlan(
      profile,
      75,
      answers({ notes: "Było różnie", noteTopic: "unrelated" }),
      all([]),
    );
    expect(unrelated.clarification).toBeNull();
    expect(unrelated.changes).toEqual([]);
  });

  it("a pain remark never changes the plan by itself and never asks a medical question", () => {
    const draft = draftNextPlan(profile, 75, answers({ notes: "Bolało mnie kolano" }), all([]));
    expect(draft.profileChanged).toBe(false);
    expect(draft.clarification).toBeNull();
    expect(draft.notes.join(" ")).toContain("nie zmienia planu automatycznie");
  });
});
