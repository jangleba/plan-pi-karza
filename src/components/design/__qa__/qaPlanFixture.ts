/** QA-only: a fixed two-week plan written by hand (no engine). */
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
import { flatToStructured } from "@/lib/loadwise/sessionStructure";
import type { Profile, SessionDay } from "@/lib/loadwise/types";

const DAY_NAMES = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"];

function isoPlusDays(start: string, days: number): string {
  const date = new Date(`${start}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayName(date: string): string {
  return DAY_NAMES[new Date(`${date}T12:00:00Z`).getUTCDay()];
}

/** A fixed, hand-written strength session (exercise library only, no builder). */
export function qaStrengthSession(_profile: Profile, date: string, dbId: string): SessionDay {
  const sections = {
    warmup: [{ name: "Mostek biodrowy", exerciseId: "glute_bridge", prescription: "2 × 10" }],
    main: [
      {
        name: "Przysiad z kettlebell",
        exerciseId: "goblet_squat",
        prescription: "3 × 8",
        rest: "90 s",
      },
      {
        name: "Przysiad bułgarski",
        exerciseId: "bulgarian_split_squat",
        prescription: "3 × 6 / nogę",
        rest: "90 s",
      },
      { name: "Pompki", exerciseId: "push_up", prescription: "3 × 10", rest: "60 s" },
    ],
    accessory: [{ name: "Dead bug", exerciseId: "dead_bug", prescription: "2 × 8 / stronę" }],
    footballTransfer: [],
    cooldown: [],
  };
  return sessionFixture({
    dbId,
    date,
    dayName: dayName(date),
    type: "strength_power",
    title: "Siła: dół ciała",
    durationMin: 45,
    sessionType: "Siła",
    intensity: "umiarkowana",
    mdLabel: null,
    sections,
    structuredSections: flatToStructured(sections),
  });
}

function restDay(date: string, dbId: string): SessionDay {
  return sessionFixture({
    dbId,
    date,
    dayName: dayName(date),
    dayType: "rest",
    type: "rest",
    title: "Wolne",
    sessionType: "Wolne",
    goalLabel: "Wolne",
    intensity: "niska",
    durationMin: 0,
  });
}

/** Strength on Monday and Tuesday of the first week, rest on the other days. */
export function qaPlan(profile: Profile, start: string, days = 14): SessionDay[] {
  return Array.from({ length: days }, (_, index) => {
    const date = isoPlusDays(start, index);
    return index < 2
      ? qaStrengthSession(profile, date, `qa-${index}`)
      : restDay(date, `qa-${index}`);
  });
}
