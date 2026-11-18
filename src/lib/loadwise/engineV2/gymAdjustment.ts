import { savedSessionDurationMode } from "./sessionDurationPolicy";
import { hasOutdatedPendingEngineWork } from "./planStatus";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import type { Profile, Readiness, SessionCompletion, SessionDay } from "../types";
import { isStrengthSession } from "../strengthCheckIn";
import { gymProgressionInput, gymStrengthResponses, type GymRecord } from "../gymEvidence";
import { trainingSetupRevision } from "../planIdentity";
import { plusDays, type EngineOptions } from "./model";
import { refreshStrengthSession, validateTrainingPlan } from "./planner";
import type { AdjustmentProposal, AdjustmentChange } from "./feedbackAdjustment";
import { getExerciseDefinition } from "../exerciseLibrary";
import type { ExerciseDecision } from "./model";
function exerciseLine(e: ExerciseDecision | undefined): string {
  if (!e) return "pominięte";
  const d = e.dose,
    setup = d.gymBandSetup;
  return `${getExerciseDefinition(e.exerciseId)?.name ?? e.exerciseId}: ${d.sets} × ${d.seconds !== undefined ? `${d.seconds} s` : d.reps}${d.perSide ? " / stronę" : ""}${d.rir !== undefined ? `, zapas ${d.rir}` : ""}, przerwa ${d.restSeconds} s${setup ? `; ${setup.bandId} · ${setup.stationId} · ${setup.forceNewtons.join(" / ")} N` : ""}`;
}

const slots = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];
const protectedSlot = (s: SessionDay, c: Record<string, SessionCompletion>) =>
  s.executionProtected ||
  (s.dbId &&
    (c[s.dbId]?.completed || ["started", "completed", "missed"].includes(c[s.dbId]?.status ?? "")));
const signature = (s: SessionDay) =>
  JSON.stringify(
    s.engineV2
      ? [
          s.engineV2.roles,
          s.engineV2.exercises.map((e) => [e.exerciseId, e.role, e.dose]),
          s.engineV2.organization,
          s.engineV2.strengthPairs,
          s.engineV2.strengthFocus?.mode,
        ]
      : null,
  );
const doseLine = (s: SessionDay) => {
  const main = s.engineV2?.exercises.find(
    (e) => e.role === (s.engineV2?.roles.includes("strengthA") ? "knee_strength" : "hip_strength"),
  );
  const d = main?.dose;
  return d
    ? `${d.sets} × ${d.reps ?? `${d.seconds} s`}${d.rir !== undefined ? `, zapas ${d.rir}` : ""}`
    : "zaktualizowana dawka";
};
export function proposeGymAdjustment(input: {
  profile: Profile;
  plan: SessionDay[];
  completions: Record<string, SessionCompletion>;
  records: GymRecord[];
  todayIso: string;
  planId: string | null;
  readiness?: Record<string, Readiness>;
  modifiedDates?: ReadonlySet<string>;
  hasUnconfirmedWrites?: boolean;
}): AdjustmentProposal | null {
  const { profile: p, plan, completions, todayIso } = input;
  if (
    !plan.length ||
    input.hasUnconfirmedWrites ||
    input.records.some((r) => r.pending) ||
    hasOutdatedPendingEngineWork(plan, completions, todayIso) ||
    p.painInjury ||
    p.seasonPhase === "return_injury"
  )
    return null;
  const source = Object.values(completions)
    .filter(
      (c) =>
        c.completed &&
        (c.writeVersion ?? 0) > 0 &&
        c.executionSnapshot &&
        isStrengthSession(c.executionSnapshot) &&
        c.executionSnapshot.date <= todayIso,
    )
    .sort((a, b) => b.executionSnapshot!.date.localeCompare(a.executionSnapshot!.date))[0];
  if (!source?.executionSnapshot?.dbId) return null;
  const end = plusDays(todayIso, 6),
    setup = trainingSetupRevision(p);
  const candidates = plan
    .flatMap(slots)
    .filter(
      (s) =>
        s.date >= todayIso &&
        s.date <= end &&
        isStrengthSession(s) &&
        !protectedSlot(s, completions) &&
        !input.modifiedDates?.has(s.date),
    );
  if (!candidates.length || candidates.some((s) => s.trainingSetupRevision !== setup)) return null;
  const evidence = JSON.stringify([
    setup,
    Object.entries(completions)
      .filter(([, c]) => c.completed)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, c]) => [
        id,
        c.status,
        c.completed,
        c.rpe,
        c.writeVersion,
        c.executionSnapshot?.date,
        c.executionSnapshot?.strengthCheckIn,
      ]),
    input.records
      .filter((r) => !r.pending)
      .map((r) => [r.record_key, r.revision, r.payload])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    p.healthPersonalizationEnabled ? input.readiness?.[todayIso] : null,
  ]);
  const key = `gym-feedback-1:${bytesToHex(sha256(evidence))}`;
  if (candidates.every((s) => s.engineV2?.gymFeedbackRevision === key)) return null;
  const options: EngineOptions = {
    startDate: plan[0].date,
    asOfDate: todayIso,
    previousPlan: plan,
    completions,
    minutesPerSession: plan[0].engineTimeBudgetMin ?? 75,
    sessionDurationMode: savedSessionDurationMode(plan),
    readiness: p.healthPersonalizationEnabled ? input.readiness : undefined,
    gymProgression: gymProgressionInput(input.records, true),
    strengthLoadResponses: gymStrengthResponses(input.records),
  };
  const candidateIds = new Set(candidates.map((s) => s.dbId));
  const changes: AdjustmentChange[] = [];
  function refresh(s: SessionDay): SessionDay {
    if (!s.dbId || !candidateIds.has(s.dbId)) return structuredClone(s);
    const next = refreshStrengthSession(s, p, options, plan);
    if (!next || signature(next) === signature(s)) return structuredClone(s);
    next.engineV2!.gymFeedbackRevision = key;
    next.feedbackAdjustments = [
      ...(s.feedbackAdjustments ?? []),
      {
        proposalId: key,
        sourceSessionId: source!.executionSnapshot!.dbId!,
        kind: "strength_update",
        appliedAt: new Date().toISOString(),
      },
    ];
    const powerOld = s.engineV2?.exercises.find((e) => e.role === "power"),
      powerNew = next.engineV2?.exercises.find((e) => e.role === "power");
    const powerChange =
      JSON.stringify(powerOld?.dose) !== JSON.stringify(powerNew?.dose) ||
      powerOld?.exerciseId !== powerNew?.exerciseId;
    changes.push({
      details: [
        ...new Set([
          ...(s.engineV2?.exercises.map((e) => e.role) ?? []),
          ...next.engineV2!.exercises.map((e) => e.role),
        ]),
      ].flatMap((role) => {
        const a = s.engineV2?.exercises.find((e) => e.role === role),
          b = next.engineV2!.exercises.find((e) => e.role === role);
        return JSON.stringify(a && [a.exerciseId, a.dose]) ===
          JSON.stringify(b && [b.exerciseId, b.dose])
          ? []
          : [`${exerciseLine(a)} → ${exerciseLine(b)}`];
      }),
      kind: "strength_update",
      sessionId: s.dbId,
      title: s.title,
      before: { date: s.date, minutes: s.durationMin },
      after: { date: next.date, minutes: next.durationMin },
      line: `${s.date}: ${s.title} — ${doseLine(s)} → ${doseLine(next)}${powerChange ? "; także zmiana zapisanej dawki/ustawienia mocy" : ""}.`,
    });
    return next;
  }
  const work = plan.map((d) => {
    // Protect the whole day if either slot is under execution.
    if (slots(d).some((s) => protectedSlot(s, completions)) || input.modifiedDates?.has(d.date))
      return structuredClone(d);
    const next = refresh(d);
    next.secondSession = d.secondSession ? refresh(d.secondSession) : null;
    return next;
  });
  if (!changes.length || validateTrainingPlan(work, p, options).length) return null;
  return {
    id: key,
    policyVersion: "gym-feedback-1",
    sourceSessionId: source.executionSnapshot.dbId,
    sourceDate: source.executionSnapshot.date,
    sourceKind: "strength",
    feedback: {
      rpe: source.rpe,
      tags: [],
      matchMinutesPlayed: null,
      feedbackVersion: source.feedbackVersion ?? null,
    },
    planId: input.planId,
    reason:
      "Propozycja po zapisach siłowni: sprawdź konkretne dawki przed zastosowaniem. Wzrost trudności jest opcją, nie obowiązkiem.",
    changes,
    affectedSessionIds: changes.map((c) => c.sessionId),
    candidatePlan: work,
    minutesPerSession: options.minutesPerSession!,
    sessionDurationMode: options.sessionDurationMode,
    fingerprint: JSON.stringify([
      key,
      input.planId,
      todayIso,
      changes,
      work.map((d) => [
        d.dbId,
        d.secondSession?.dbId,
        signature(d),
        d.secondSession ? signature(d.secondSession) : null,
      ]),
    ]),
  };
}
