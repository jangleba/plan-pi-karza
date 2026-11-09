import { describe, expect, it } from "vitest";
import type { Level, Position } from "@/lib/loadwise/types";
import { clubTacticalCues, clubTopics, iqTopicKey } from "./clubTactics";
import { situations } from "./situationBank";

const positions: Position[] = ["goalkeeper", "defender", "midfielder", "forward"];
const levels: Level[] = ["beginner", "intermediate", "advanced", "elite"];
const dates = Array.from({ length: 30 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);

describe("club tactical cues", () => {
  it("keeps every cue tactical, conditional and free of body details", () => {
    for (const topic of Object.values(clubTopics))
      for (const [, text] of topic.cues) {
        expect(text).toMatch(/\.$/);
        expect(text.length).toBeLessThan(170);
        // Not obvious: every cue is tied to a trigger in the rival shape or the game.
        expect(text).toMatch(
          /\b(gdy|przy|po|w chwili|tylko wtedy|dopiero|przeciw|w kontrze|w pressingu|w 1 na 2|tyłem do bramki|stój)\b/i,
        );
        // Only what to do.
        expect(text).not.toMatch(/(^|\s)(bo|ponieważ|dlatego)\s/i);
        expect(text).not.toMatch(/głow|ramię|ramie|bioder|ręk|spójrz|spojrz|wzrok|skanuj/i);
        expect(text).not.toMatch(/ostatniego obrońcy/);
      }
  });

  it("uses IQ situation keys for every topic", () => {
    const keys = new Set(situations.map((s) => s.key));
    for (const key of Object.keys(clubTopics)) expect(keys.has(key), key).toBe(true);
  });

  it("gives every position and level distinct tasks on every day", () => {
    for (const position of positions)
      for (const level of levels)
        for (const date of dates) {
          const cues = clubTacticalCues({ position, level, date });
          const advanced = level === "advanced" || level === "elite";
          expect(cues.length, `${position}/${level}`).toBe(advanced ? 3 : 2);
          expect(new Set(cues.map((c) => c.topic)).size).toBe(cues.length);
          const max = level === "beginner" ? 1 : level === "intermediate" ? 2 : 3;
          for (const c of cues) {
            expect(c.tier).toBeLessThanOrEqual(max);
            expect(clubTopics[c.topic].positions).toContain(position);
          }
          if (advanced) expect(cues.some((c) => c.tier === 3)).toBe(true);
        }
  });

  it("changes the tasks between club sessions", () => {
    const seen = new Set(
      dates.map((date) =>
        clubTacticalCues({ position: "midfielder", level: "advanced", date })
          .map((c) => c.topic)
          .join(),
      ),
    );
    expect(seen.size).toBeGreaterThan(3);
  });

  it("leads with the last IQ lesson topic", () => {
    const cues = clubTacticalCues({
      position: "defender",
      level: "elite",
      date: "2026-11-09",
      recentIqTopicId: "iqs-cb-step-out",
    });
    expect(cues[0].topic).toBe("cb-step-out");
    expect(cues[0].tier).toBe(3);
    expect(iqTopicKey("iqs-unknown")).toBeNull();
    expect(iqTopicKey("third-player")).toBeNull();
  });
});
