/**
 * FuelWise Engine — jedyne miejsce z regułami decyzyjnymi.
 *
 * Zasady:
 * - funkcje czyste i deterministyczne (brak Date.now(), Math.random(), AI),
 * - werdykt wynika z: czasu do startu, typu/intensywności/czasu jednostki,
 *   wielkości porcji, dostępności węglowodanów i ciężkości posiłku.
 */

import type {
  FuelRequest,
  FuelResult,
  FuelSessionInput,
  ParsedMeal,
  Portion,
  TimeBucket,
  Verdict,
} from "./types";

/** Reprezentatywna liczba minut dla wybranego zakresu. */
export const TIME_BUCKET_MINUTES: Record<TimeBucket, number> = {
  lt30: 20,
  "30_60": 45,
  "60_120": 90,
  "120_240": 180,
  gt240: 300,
};

export const TIME_BUCKET_LABELS: Record<TimeBucket, string> = {
  lt30: "< 30 min",
  "30_60": "30–60 min",
  "60_120": "1–2 h",
  "120_240": "2–4 h",
  gt240: "> 4 h",
};

const PORTION_LABELS: Record<Portion, string> = {
  mala: "mała",
  normalna: "normalna",
  duza: "duża",
};

const PORTION_LOAD: Record<Portion, number> = {
  mala: 0.7,
  normalna: 1,
  duza: 1.35,
};

/** Ile minut potrzebuje żołądek na ten posiłek przy tej porcji. */
export function requiredLeadMinutes(meal: ParsedMeal, portion: Portion): number {
  const base = meal.recognized ? 25 : 30;
  const solid = meal.carbSlow.length + meal.protein.length + meal.fiber.length > 0;
  const lead = (base + meal.heaviness * 22 + (solid ? 30 : 0)) * PORTION_LOAD[portion];
  return Math.round(lead / 5) * 5;
}

/** Czy jednostka realnie wymaga dostępnych węglowodanów. */
function needsCarbs(session: FuelSessionInput): boolean {
  if (session.kind === "recovery" || session.kind === "none") return false;
  if (session.kind === "match") return true;
  if (session.intensity === "wysoka") return true;
  return (session.durationMin ?? 0) >= 60;
}

/** Wrażliwość jednostki na ciężki żołądek (mnożnik wymaganego odstępu). */
function sessionSensitivity(session: FuelSessionInput): number {
  if (session.kind === "speed" || session.kind === "match") return 1.25;
  if (session.kind === "endurance") return 1.15;
  if (session.kind === "recovery") return 0.8;
  if (session.intensity === "wysoka") return 1.15;
  return 1;
}

export function minutesToStartOf(req: FuelRequest): number | null {
  if (req.session.minutesToStart != null) return req.session.minutesToStart;
  if (req.timeBucket) return TIME_BUCKET_MINUTES[req.timeBucket];
  return null;
}

function joinList(list: string[]): string {
  return list.join(", ");
}

function lightCarbSuggestion(meal: ParsedMeal): string {
  if (meal.carbFast.length) return joinList(meal.carbFast.map((i) => i.label));
  if (meal.carbSlow.length) return `mniejsza porcja: ${meal.carbSlow[0].label}`;
  return "banan lub izotonik";
}

/** Główna reguła: werdykt + komplet komunikatów. */
export function evaluateMeal(req: FuelRequest): FuelResult | null {
  const minutes = minutesToStartOf(req);
  if (minutes == null || req.session.kind === "none") return null;

  const { meal, portion, session } = req;
  const need = Math.round(requiredLeadMinutes(meal, portion) * sessionSensitivity(session));
  const carbsNeeded = needsCarbs(session);

  const heavyItems = meal.items.filter((i) => i.heaviness >= 3).map((i) => i.label);
  const lightItems = meal.items
    .filter((i) => i.heaviness <= 1 && !i.roles.includes("caffeine"))
    .map((i) => i.label);

  let verdict: Verdict;
  let ruleId: string;
  let why: string;
  let change: string | null = null;

  if (need > minutes * 1.8) {
    verdict = "ZOSTAW_NA_POZNIEJ";
    ruleId = "LEAD_FAR_EXCEEDED_V1";
    why = `Ten zestaw potrzebuje około ${need} min na strawienie, a do jednostki zostało ${minutes} min. Zjedzony teraz obciąży żołądek na ${sessionLabel(session)}.`;
    change = heavyItems.length
      ? `Zostaw na po treningu: ${joinList(heavyItems)}. Teraz tylko ${lightCarbSuggestion(meal)}.`
      : `Zjedz teraz tylko lekką część, resztę po jednostce.`;
  } else if (need > minutes) {
    verdict = "POPRAW";
    ruleId = "LEAD_EXCEEDED_V1";
    why = `Posiłek jest zbyt ciężki na ${minutes} min przed startem (potrzebuje ok. ${need} min). Sam skład jest w porządku, problem jest w tym momencie.`;
    change = heavyItems.length
      ? `Ogranicz teraz: ${joinList(heavyItems)} — porcja ${PORTION_LABELS[portion]} jest za duża na to okno.`
      : `Zmniejsz porcję do lekkiej i postaw na węglowodany.`;
  } else if (carbsNeeded && !meal.hasCarbs) {
    verdict = "POPRAW";
    ruleId = "CARBS_MISSING_V1";
    why = `Do ${sessionLabel(session)} brakuje w tym posiłku źródła węglowodanów. Timing jest dobry, skład nie daje paliwa na intensywną pracę.`;
    change = "Dołóż węglowodany: banan, kromka chleba z miodem albo izotonik.";
  } else if (
    carbsNeeded &&
    minutes < 60 &&
    meal.carbFast.length === 0 &&
    meal.carbSlow.length > 0
  ) {
    verdict = "POPRAW";
    ruleId = "CARBS_TOO_SLOW_V1";
    why = `Na ${minutes} min przed startem węglowodany złożone nie zdążą się uwolnić. Potrzebujesz szybszego źródła.`;
    change = `Zamień część (${meal.carbSlow[0].label}) na banan, żel lub izotonik.`;
  } else if (meal.caffeine.length && minutes < 30) {
    verdict = "POPRAW";
    ruleId = "CAFFEINE_LATE_V1";
    why = `Skład i timing są w porządku, ale ${meal.caffeine[0].label} tak blisko startu częściej daje rozdrażnienie niż efekt.`;
    change = `Odstaw ${meal.caffeine[0].label} albo przyjmij go 45–60 min przed startem.`;
  } else {
    verdict = "PASUJE";
    ruleId = "MEAL_FITS_V1";
    why = `Zestaw mieści się w oknie ${minutes} min przed jednostką (potrzebuje ok. ${need} min). Skład daje paliwo na ${sessionLabel(session)}.`;
    change = null;
  }

  const keep =
    verdict === "PASUJE"
      ? meal.items.map((i) => i.label)
      : lightItems.length
        ? lightItems
        : meal.carbFast.concat(meal.carbSlow).map((i) => i.label);

  const bestVersion = buildBestVersion(req, minutes, verdict);
  const alternative = buildAlternative(req, minutes, verdict);

  return {
    verdict,
    ruleId,
    why,
    keep: dedupe(keep),
    change,
    bestVersion,
    alternative,
    onlyThis: req.onlyThis ? buildOnlyThis(req, minutes, need) : null,
    minutesToStart: minutes,
    requiredLeadMinutes: need,
  };
}

function dedupe(list: string[]): string[] {
  return Array.from(new Set(list));
}

function sessionLabel(session: FuelSessionInput): string {
  if (session.kind === "match") return "mecz";
  if (session.kind === "speed") return "pracę szybkościową";
  if (session.kind === "strength") return "trening siłowy";
  if (session.kind === "endurance") return "pracę wytrzymałościową";
  if (session.kind === "recovery") return "jednostkę regeneracyjną";
  return "trening";
}

function buildBestVersion(req: FuelRequest, minutes: number, verdict: Verdict): string {
  const { meal, portion } = req;
  if (verdict === "PASUJE") {
    return `Zostaw tak, jak wpisałeś: ${meal.items.map((i) => i.label).join(" + ") || meal.raw.trim()} w porcji ${PORTION_LABELS[portion]}.`;
  }
  const parts: string[] = [];
  const carbs = meal.carbFast.length ? meal.carbFast : meal.carbSlow;
  if (carbs.length) parts.push(minutes < 60 ? `mała porcja: ${carbs[0].label}` : carbs[0].label);
  else parts.push(minutes < 60 ? "banan lub izotonik" : "porcja pieczywa lub ryżu");
  if (minutes >= 120 && meal.protein.length) parts.push(`chuda porcja: ${meal.protein[0].label}`);
  if (meal.drinks.length) parts.push("300–400 ml płynów małymi łykami");
  else parts.push("300 ml wody");
  const removed = meal.items.filter((i) => i.heaviness >= 3).map((i) => i.label);
  const tail = removed.length ? ` Bez: ${joinList(removed)} do końca jednostki.` : "";
  return `${parts.join(" + ")}.${tail}`;
}

function buildAlternative(
  req: FuelRequest,
  minutes: number,
  verdict: Verdict,
): string | null {
  if (verdict === "PASUJE") return null;
  if (minutes < 30) return "Alternatywa: izotonik lub żel + woda — nic stałego.";
  if (minutes < 60) return "Alternatywa: banan + 300 ml izotoniku.";
  if (minutes < 120) return "Alternatywa: kanapka z dżemem + woda.";
  return "Alternatywa: ryż lub makaron z chudym mięsem i małą ilością warzyw.";
}

function buildOnlyThis(req: FuelRequest, minutes: number, need: number) {
  const { meal } = req;
  const light = meal.items.filter((i) => i.heaviness <= 1).map((i) => i.label);
  const medium = meal.items.filter((i) => i.heaviness === 2).map((i) => i.label);
  const heavy = meal.items.filter((i) => i.heaviness >= 3).map((i) => i.label);

  if (need <= minutes) {
    return {
      eatNow: dedupe(light.concat(medium, heavy)),
      eatLess: [],
      later: [],
    };
  }
  return {
    eatNow: dedupe(light.length ? light : medium.slice(0, 1)),
    eatLess: dedupe(minutes < 60 ? medium : medium.concat(heavy.slice(0, 1))),
    later: dedupe(minutes < 60 ? heavy.concat(medium.slice(1)) : heavy.slice(1)),
  };
}

/** Krótka, deterministyczna rekomendacja przed treningiem. */
export function preSessionPlan(session: FuelSessionInput, minutes: number | null): string {
  if (session.kind === "none") return "";
  const intensity = session.intensity ?? "umiarkowana";
  const window =
    minutes == null
      ? null
      : minutes < 30
        ? "lt30"
        : minutes < 60
          ? "30_60"
          : minutes < 120
            ? "60_120"
            : "gt120";

  const core =
    session.kind === "match" || intensity === "wysoka"
      ? "Postaw na łatwo dostępne węglowodany i mało tłuszczu — jednostka jest intensywna."
      : session.kind === "strength"
        ? "Potrzebujesz węglowodanów i porcji białka, bez ciężkiego tłuszczu."
        : session.kind === "recovery"
          ? "Normalny posiłek wystarczy — nie ma potrzeby ładowania energii."
          : "Lekki posiłek węglowodanowy z małą porcją białka.";

  const timing =
    window === null
      ? "Zaplanuj ostatni większy posiłek 2–3 h przed startem."
      : window === "lt30"
        ? "Teraz tylko płyny, żel lub banan."
        : window === "30_60"
          ? "Mały, płynny lub owocowy posiłek, bez tłuszczu i błonnika."
          : window === "60_120"
            ? "Mały posiłek węglowodanowy, minimum tłuszczu."
            : "Możesz zjeść pełny posiłek — masz czas na trawienie.";

  return `${core} ${timing}`;
}
