import { describe, expect, it } from "vitest";

import { choreograph } from "./choreography";
import { shadowReceiveScenario } from "./scenarios";

describe("Football IQ match structure", () => {
  it("renders a complete 11v11 context without changing decision actors", () => {
    const actors = choreograph(shadowReceiveScenario);
    const ownTeam = actors.filter((actor) => actor.kind === "self" || actor.kind === "mate");
    const opponents = actors.filter((actor) => actor.kind === "opponent");

    expect(ownTeam).toHaveLength(11);
    expect(opponents).toHaveLength(11);
    expect(actors.filter((actor) => actor.kind === "ball")).toHaveLength(1);

    for (const source of shadowReceiveScenario.actors) {
      const rendered = actors.find((actor) => actor.id === source.id);
      expect(rendered).toBeDefined();
      expect(rendered!.kind).toBe(source.kind);
    }
  });

  it("keeps every generated keyframe inside the pitch", () => {
    for (const actor of choreograph(shadowReceiveScenario)) {
      for (const frame of actor.path) {
        expect(frame.x).toBeGreaterThanOrEqual(5);
        expect(frame.x).toBeLessThanOrEqual(95);
        expect(frame.y).toBeGreaterThanOrEqual(6);
        expect(frame.y).toBeLessThanOrEqual(134);
      }
    }
  });
});
