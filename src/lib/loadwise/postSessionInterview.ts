import type { SessionCompletion, SessionDay } from "./types";

export type PostSessionKind = "own" | "club" | "match";
export type EffortChoice = "light" | "planned" | "hard" | "very_hard";

export const EFFORT_OPTIONS: ReadonlyArray<{
  id: EffortChoice;
  label: string;
  rpe: number;
}> = [
  { id: "light", label: "Lekko", rpe: 4 },
  { id: "planned", label: "Zgodnie z planem", rpe: 6 },
  { id: "hard", label: "Ciężko", rpe: 8 },
  { id: "very_hard", label: "Bardzo ciężko", rpe: 9 },
];

export const CLUB_ACTIVITY_OPTIONS: ReadonlyArray<{
  id: NonNullable<SessionCompletion["activityType"]>;
  label: string;
}> = [
  { id: "technical", label: "Głównie z piłką" },
  { id: "mixed", label: "Mieszany" },
  { id: "running_endurance", label: "Głównie biegowy" },
];

export function postSessionKind(session: SessionDay): PostSessionKind {
  if (session.dayType === "match") return "match";
  if (session.dayType === "club") return "club";
  return "own";
}

export function interviewQuestionCount(session: SessionDay): number {
  const kind = postSessionKind(session);
  if (kind === "own") return 1;
  if (kind === "match") return 2;
  return 3;
}

export function effortChoiceFromRpe(
  rpe: number | null | undefined,
): EffortChoice {
  const value = rpe ?? 6;
  return [...EFFORT_OPTIONS].sort(
    (a, b) => Math.abs(a.rpe - value) - Math.abs(b.rpe - value),
  )[0].id;
}

export function rpeFromEffort(choice: EffortChoice): number {
  return EFFORT_OPTIONS.find((item) => item.id === choice)?.rpe ?? 6;
}

export function minutePresets(kind: PostSessionKind): number[] {
  if (kind === "match") return [0, 30, 60, 90];
  if (kind === "club") return [30, 60, 90, 120];
  return [];
}

export function normalizePostSessionAnswers(input: {
  session: SessionDay;
  effort: EffortChoice;
  durationMin?: number | null;
  activityType?: SessionCompletion["activityType"];
}): {
  rpe: number;
  notes: "";
  details: Pick<SessionCompletion, "durationMin" | "activityType">;
} {
  const kind = postSessionKind(input.session);
  const actualDuration = Math.max(
    0,
    Math.min(
      300,
      Math.round(input.durationMin ?? input.session.durationMin ?? 0),
    ),
  );
  return {
    rpe: rpeFromEffort(input.effort),
    notes: "",
    details: {
      durationMin: kind === "own" ? input.session.durationMin : actualDuration,
      activityType:
        kind === "club"
          ? (input.activityType ?? "mixed")
          : kind === "match"
            ? "mixed"
            : null,
    },
  };
}
