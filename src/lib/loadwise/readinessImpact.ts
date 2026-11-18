import type { Readiness, SessionDay } from "./types";
import { hasMedicalRedFlag, readinessScore } from "./readinessModel";
import { adjustedForReadiness, hasReadinessStop } from "./engineV2/planStatus";

/**
 * What a saved check-in really does to today's training, using the same rules the planner and
 * the progression apply (planStatus: stop and lighter plan; gymProgression: no load increase
 * below 7). It never invents an adjustment the engine does not make.
 */
type ReadinessImpactKind = "stop" | "paused" | "adjusted" | "lighter" | "hold" | "none";
interface ReadinessImpact {
  kind: ReadinessImpactKind;
  text: string;
}

const SUPPORT_ROLES = ["activation", "recovery", "mobility", "skills"];

export function readinessImpact(
  readiness: Readiness,
  session: SessionDay | null | undefined,
): ReadinessImpact {
  if (hasMedicalRedFlag(readiness))
    return {
      kind: "stop",
      text: "Nie rozpoczynaj treningu. Zgłoszone objawy wymagają pilnego kontaktu z lekarzem. W nagłym zagrożeniu zadzwoń pod 112.",
    };
  const recipe = session?.engineV2;
  const title = session?.title ? `„${session.title}”` : "tej sesji";
  if (hasReadinessStop(readiness))
    return {
      kind: "paused",
      text: recipe
        ? `Zgłoszony ból wstrzymuje start dzisiejszej sesji własnej ${title}. Nie wykonuj ruchu, który nasila ból.`
        : "Zgłoszony ból wstrzymuje nowe treningi własne. Dziś nie masz sesji własnej; nie wykonuj ruchu, który nasila ból.",
    };
  if (!recipe)
    return {
      kind: "none",
      text: "Dziś nie masz sesji własnej, więc check-in nie zmienia treningu. Zostaje zapisany do oceny kolejnych dni.",
    };
  const score = readinessScore(readiness) ?? readiness.overall;
  if (session && adjustedForReadiness(session, readiness))
    return {
      kind: "adjusted",
      text: `Sesja ${title} została dostosowana do dzisiejszego check-inu (${session.readinessAdjustment!.beforeMinutes} → ${session.readinessAdjustment!.afterMinutes} min). Szczegóły poniżej.`,
    };
  const supportOnly = recipe.roles.every((role) => SUPPORT_ROLES.includes(role));
  const jump = recipe.exercises.some((e) => e.role === "power" || e.role === "landing");
  if (score <= 4 && (!supportOnly || jump))
    return {
      kind: "lighter",
      text: `Dzisiejsze odpowiedzi wymagają lżejszego planu dla sesji ${title}. Przed startem zaktualizuj plan; zapisane wykonania zostają.`,
    };
  const strength = recipe.roles.some((role) => role === "strengthA" || role === "strengthB");
  if (strength && score < 7)
    return {
      kind: "hold",
      text: `Sesja ${title} zostaje, ale ciężary w seriach nie rosną dziś (progresja wstrzymana). Wciąż możesz zmienić każdy ciężar sam.`,
    };
  return { kind: "none", text: `Bez wpływu na dzisiejszą sesję ${title}.` };
}
