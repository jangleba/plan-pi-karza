import { describe, expect, it } from "vitest";
import { advancedJourneyBank } from "./advancedJourneyBank";
import {
  completeFieldTask,
  fieldTasks,
  loadFieldTask,
  openFieldTask,
  pickFieldTask,
  saveFieldTask,
} from "./fieldTask";
import { situationBank, situations } from "./situationBank";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe("field task", () => {
  it("has concrete tasks for every situation and every older concept", () => {
    for (const s of situations) expect(fieldTasks[s.key]?.length, s.key).toBeGreaterThan(1);
    for (const c of ["third-player", "overload-switch", "press-cover"])
      expect(fieldTasks[c].length).toBeGreaterThan(1);
    for (const list of Object.values(fieldTasks))
      for (const text of list) {
        expect(text).toMatch(/\.$/);
        expect(text.length).toBeLessThan(100);
        expect(text).not.toMatch(/(^|\s)(bo|ponieważ|dlatego)\s/);
        // Tactics only: no body details the pitch view cannot show.
        expect(text).not.toMatch(/głow|ramię|ramie|bioder|ręk|spójrz|spojrz|wzrok/i);
        // Offside is judged against the second-last opponent, never the last defender.
        expect(text).not.toMatch(/ostatniego obrońcy/);
      }
  });

  it("picks a task from the lesson topic for every start", () => {
    for (const def of [...advancedJourneyBank, ...situationBank]) {
      const task = pickFieldTask(def, "goal", null);
      expect(task.topicId).toBe(def.topicId);
      expect(task.text.length).toBeGreaterThan(10);
    }
  });

  it("rotates to a new task when the same topic is played again", () => {
    const def = situationBank.find((d) => d.id === "iqs-hold-up-0")!;
    const first = pickFieldTask(def, "goal", null);
    const second = pickFieldTask(def, "goal", first);
    expect(second.text).not.toBe(first.text);
    expect(pickFieldTask(def, "goal", second).text).toBe(first.text);
  });

  it("gives the offside task after an offside finish", () => {
    const def = situationBank[0];
    expect(pickFieldTask(def, "offside", null).text).toMatch(/przedostatniego rywala/);
  });

  it("stores one open task per player until it is marked done", () => {
    const storage = memoryStorage();
    expect(openFieldTask("p1", storage)).toBeNull();
    const task = pickFieldTask(situationBank[0], "goal", null, new Date("2026-11-08T10:00:00Z"));
    saveFieldTask("p1", task, storage);
    expect(openFieldTask("p1", storage)?.text).toBe(task.text);
    expect(openFieldTask("p2", storage)).toBeNull();
    completeFieldTask("p1", storage);
    expect(openFieldTask("p1", storage)).toBeNull();
    expect(loadFieldTask("p1", storage)?.done).toBe(true);
    saveFieldTask(undefined, task, storage);
    expect(openFieldTask(undefined, storage)).toBeNull();
  });

  it("ignores damaged storage", () => {
    const storage = memoryStorage();
    storage.setItem("ballwise:iq:field-task:v1:p1", "{bad json");
    expect(loadFieldTask("p1", storage)).toBeNull();
    storage.setItem("ballwise:iq:field-task:v1:p1", JSON.stringify({ text: 1 }));
    expect(loadFieldTask("p1", storage)).toBeNull();
  });
});
