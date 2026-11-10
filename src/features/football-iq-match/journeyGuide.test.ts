import { describe, expect, it } from "vitest";
import { advancedJourneyBank } from "./advancedJourneyBank";
import { decisionOptions } from "./decisionOptions";
import { chooseJourney, createJourneyForRules } from "./journeyEngine";
import {
  ACTION_TIME_LIMIT_SECONDS,
  nextContext,
  nextDefinition,
  pickerItems,
  startLine,
  startLines,
} from "./journeyGuide";
import { playableSituationBank, situationBank } from "./situationBank";

describe("start instruction", () => {
  it("describes the real starting picture of every lesson", () => {
    for (const def of [...advancedJourneyBank, ...situationBank]) {
      const s = createJourneyForRules(def, 9);
      const lines = startLines(s, "learn");
      const [who, independent, controls] = lines;
      const flow = lines.at(-2)!,
        mode = lines.at(-1)!;
      const you = s.players.find((p) => p.id === "you")!;
      const carrier = s.players.find((p) => p.id === s.world.carrierId)!;
      expect(who, def.id).toContain(`nr ${you.number}`);
      if (carrier.id === "you") expect(who).toContain("masz piłkę");
      else
        expect(who).toContain(`${carrier.team === "home" ? "partner" : "rywal"} ${carrier.number}`);
      // No ready-made options before a decision: the help explains gestures, not answers.
      expect(independent).toMatch(/nic nie podpowiada/);
      expect(controls).toMatch(/Dotknij partnera/);
      expect(lines.join(" ")).not.toMatch(/opcj|strzałk/i);
      expect(flow).toContain(`${ACTION_TIME_LIMIT_SECONDS / 60} minuty`);
      expect(mode).toMatch(/Po każdej decyzji/);
    }
  });

  it("the one-line start names TY and the real ball carrier", () => {
    for (const def of [...advancedJourneyBank, ...situationBank]) {
      const s = createJourneyForRules(def, 9);
      const line = startLine(s);
      const you = s.players.find((p) => p.id === "you")!;
      const carrier = s.players.find((p) => p.id === s.world.carrierId)!;
      expect(line, def.id).toMatch(new RegExp(`^Jesteś nr ${you.number}\\b`));
      if (carrier.id === "you") expect(line).toContain("masz piłkę");
      else
        expect(line).toContain(
          `${carrier.team === "home" ? "partner" : "rywal"} ${carrier.number}`,
        );
    }
  });

  it("promises a review after each decision only in learning mode", () => {
    const s = createJourneyForRules(situationBank[0], 9);
    expect(startLines(s, "challenge").at(-1)).toMatch(/Bez przerw/);
    expect(startLines(s, "learn").at(-1)).toMatch(/inne rozwiązanie/);
  });

  it("keeps the promised end conditions of a whole action", () => {
    // Loss of the ball does not end the action; only goal, miss, offside or the time cap do.
    let s = createJourneyForRules(
      situationBank.find((d) => d.id === "iqs-counter-press-0")!,
      9,
    );
    expect(s.players.find((p) => p.id === s.world.carrierId)!.team).toBe("away");
    s = chooseJourney(s, decisionOptions(s)[0].choice.id, 1);
    if (s.outcome) expect(["goal", "miss", "offside", "stopped"]).toContain(s.attack!.finish);
  });
});

describe("situation picker", () => {
  it("shows own-position topics first and all topics on demand", () => {
    const own = pickerItems("forward");
    const all = pickerItems("forward", true);
    expect(own.every((i) => i.own)).toBe(true);
    expect(all.length).toBeGreaterThan(own.length);
    expect(new Set(all.map((i) => i.def.topicId)).size).toBe(all.length);
    // Two situations have no playable picture yet (variantGenerator.test.ts).
    expect(all.length).toBe(32);
    for (const i of all) expect(playableSituationBank).toContain(i.def);
    expect(all.some((i) => i.moment === "transition")).toBe(true);
  });

  it("moves to the next topic and to another context of the same topic", () => {
    const first = pickerItems("defender")[0].def;
    expect(nextDefinition(first, "defender").topicId).not.toBe(first.topicId);
    // Cycles through every playable picture of the topic and back to the first.
    const pictures = playableSituationBank.filter((d) => d.topicId === first.topicId);
    let at = first;
    const seen = new Set([at.id]);
    for (let i = 1; i < pictures.length; i++) {
      at = nextContext(at);
      expect(at.topicId).toBe(first.topicId);
      seen.add(at.id);
    }
    expect(seen.size).toBe(pictures.length);
    expect(nextContext(at).id).toBe(first.id);
  });
});
