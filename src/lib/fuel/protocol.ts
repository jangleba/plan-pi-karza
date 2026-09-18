import type { FuelTargetRange, MealRecommendation } from "./recommendations";
import type { FuelSessionInput } from "./types";

export type FuelProtocolStage = "now" | "pre" | "session" | "recovery";
export type FuelProtocolStatus = "active" | "upcoming" | "done" | "adjusted";

export interface FuelProtocolItem {
  id: FuelProtocolStage;
  eyebrow: string;
  timeLabel: string;
  title: string;
  detail: string;
  status: FuelProtocolStatus;
}

export interface FuelProtocol {
  version: 1;
  sessionKey: string;
  createdAt: string;
  leadMinutes: number;
  mealId: string;
  mealTitle: string;
  items: FuelProtocolItem[];
  lastResponse: string | null;
}

export interface FuelProtocolInput {
  session: FuelSessionInput;
  minutes: number;
  recommendation: MealRecommendation;
  target: FuelTargetRange;
  now?: Date;
}

function sessionKey(session: FuelSessionInput): string {
  return [session.date ?? "bez-daty", session.title ?? session.kind, session.durationMin ?? 0].join(
    ":",
  );
}

function demandIsHigh(session: FuelSessionInput): boolean {
  return (
    session.kind === "match" ||
    session.kind === "speed" ||
    session.intensity === "wysoka" ||
    (session.durationMin ?? 0) >= 75
  );
}

function recoveryDetail(session: FuelSessionInput): string {
  if (session.kind === "recovery") return "Woda i zwykły pełny posiłek, kiedy wróci apetyt.";
  return "Pełny posiłek z węglowodanami i źródłem białka w ciągu 1–2 godzin.";
}

export function buildFuelProtocol({
  session,
  minutes,
  recommendation,
  target,
  now = new Date(),
}: FuelProtocolInput): FuelProtocol {
  const highDemand = demandIsHigh(session);
  const shortLead = minutes < 60;
  const duringTitle =
    highDemand && (session.durationMin ?? 0) >= 60 ? "Płyn pod ręką" : "Pij według pragnienia";
  const duringDetail =
    highDemand && (session.durationMin ?? 0) >= 60
      ? "Kilka łyków przy każdej naturalnej przerwie. Przy dłuższej jednostce wybierz izotonik."
      : "Woda wystarczy przy standardowej jednostce; nie pij dużej objętości naraz.";

  return {
    version: 1,
    sessionKey: sessionKey(session),
    createdAt: now.toISOString(),
    leadMinutes: Math.max(0, Math.round(minutes)),
    mealId: recommendation.id,
    mealTitle: recommendation.title,
    lastResponse: null,
    items: [
      {
        id: "now",
        eyebrow: "TERAZ",
        timeLabel: shortLead ? "najbliższe 10 min" : "teraz",
        title: recommendation.title,
        detail: `${portionLabel(recommendation.portion)} porcja · cel ${target.carbMinG}–${target.carbMaxG} g węglowodanów`,
        status: "active",
      },
      {
        id: "pre",
        eyebrow: "PRZED",
        timeLabel: minutes <= 35 ? "10 min przed" : "25–35 min przed",
        title: "Krótki check-in",
        detail: shortLead
          ? `Jeśli nadal czujesz głód: kilka kęsów banana. Płyny łącznie ${target.fluidMinMl}–${target.fluidMaxMl} ml.`
          : `Sprawdź lekkość i energię. Płyny łącznie ${target.fluidMinMl}–${target.fluidMaxMl} ml.`,
        status: "upcoming",
      },
      {
        id: "session",
        eyebrow: "TRENING",
        timeLabel: session.durationMin ? `${session.durationMin} min` : "w trakcie",
        title: duringTitle,
        detail: duringDetail,
        status: "upcoming",
      },
      {
        id: "recovery",
        eyebrow: "PO",
        timeLabel: "do 2 h po",
        title: "Spokojne uzupełnienie",
        detail: recoveryDetail(session),
        status: "upcoming",
      },
    ],
  };
}

function portionLabel(portion: MealRecommendation["portion"]): string {
  if (portion === "mala") return "Mała";
  if (portion === "duza") return "Duża";
  return "Normalna";
}

export function mergeFuelProtocolProgress(
  next: FuelProtocol,
  previous: FuelProtocol | null,
): FuelProtocol {
  if (!previous || previous.sessionKey !== next.sessionKey || previous.mealId !== next.mealId)
    return next;
  const done = new Set(
    previous.items.filter((item) => item.status === "done").map((item) => item.id),
  );
  const firstPending = next.items.find((item) => !done.has(item.id))?.id;
  return {
    ...next,
    lastResponse: previous.lastResponse,
    items: next.items.map((item) => ({
      ...item,
      status: done.has(item.id) ? "done" : item.id === firstPending ? "active" : "upcoming",
    })),
  };
}

export function completeFuelProtocolItem(
  protocol: FuelProtocol,
  id: FuelProtocolStage,
): FuelProtocol {
  const completed = new Set(
    protocol.items
      .filter((item) => item.status === "done" || item.id === id)
      .map((item) => item.id),
  );
  const firstPending = protocol.items.find((item) => !completed.has(item.id))?.id;
  return {
    ...protocol,
    items: protocol.items.map((item) => ({
      ...item,
      status: completed.has(item.id) ? "done" : item.id === firstPending ? "active" : "upcoming",
    })),
  };
}

export function adaptFuelProtocolForMessage(
  protocol: FuelProtocol,
  message: string,
  target: FuelTargetRange,
): FuelProtocol {
  const normalized = message.trim().toLocaleLowerCase("pl");
  const partialMeal = /połow|polow|część|czesc|nie dokończ|nie dokoncz|mało zjad|malo zjad/.test(
    normalized,
  );
  if (!partialMeal) {
    return {
      ...protocol,
      lastResponse:
        "Nie zmieniłem planu. Napisz konkretnie, ile zjadłeś albo za ile zaczyna się trening.",
    };
  }

  return {
    ...protocol,
    lastResponse: "Skorygowałem tylko brakujące paliwo — reszta protokołu zostaje bez zmian.",
    items: protocol.items.map((item) => {
      if (item.id === "now" && item.status !== "done") return { ...item, status: "done" };
      if (item.id === "pre" && item.status !== "done") {
        return {
          ...item,
          title: "Uzupełnij brakującą część",
          detail: `Banan lub 2 kromki pieczywa z dżemem + ${target.fluidMinMl}–${Math.min(target.fluidMaxMl, 450)} ml płynu.`,
          status: "adjusted",
        };
      }
      return item;
    }),
  };
}

export function parseTrainingLeadMinutes(message: string): number | null {
  const normalized = message.toLocaleLowerCase("pl").replace(",", ".");
  const hours = normalized.match(
    /(?:za|start\s+za|trening\s+za)\s*(\d+(?:\.\d+)?)\s*(?:h|godz|godzin)/,
  );
  const minutes = normalized.match(/(?:za|start\s+za|trening\s+za)\s*(\d+)\s*(?:min|minut)/);
  if (hours) return Math.max(0, Math.round(Number(hours[1]) * 60));
  if (minutes) return Math.max(0, Number(minutes[1]));
  return null;
}

export function fuelProtocolProgress(protocol: FuelProtocol): { done: number; total: number } {
  return {
    done: protocol.items.filter((item) => item.status === "done").length,
    total: protocol.items.length,
  };
}

export function fuelProtocolStorageKey(userId: string, session: FuelSessionInput): string {
  return `ballwise:fuel-protocol:${userId}:${sessionKey(session)}`;
}
