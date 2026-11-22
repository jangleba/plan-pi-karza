import { normalizeCheckIn, strainOf } from "../adapt";
import type { Level } from "../types";
import { TECHNICAL_FAMILIES, TECHNICAL_SOURCES } from "./catalog";
import { technicalScene } from "./scene";
import { validateTechnicalScene } from "./validate";
import { DEFAULT_TECHNICAL_SETTINGS, FOCUS_LABEL, MODE_LABEL, POSITION_ROLES, ROLE_LABEL } from "./types";
import type { PracticeMode, Stage, TechnicalDose, TechnicalExercise, TechnicalFamily, TechnicalRequest, TechnicalResult, TechnicalSession, TechnicalSettings } from "./types";

const LEVEL: Record<Level, number> = { beginner: 0, intermediate: 1, advanced: 2 };
const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" ? v as Record<string, unknown> : {};
const num = (v: unknown, fallback: number, min: number, max: number): number => typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
export function validTechnicalDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Nieznany sprzęt nigdy nie staje się automatycznie dostępnym sprzętem. */
export function normalizeTechnicalSettings(value: unknown): TechnicalSettings {
  const r = obj(value), space = obj(r.space), resources = obj(r.resources), d = DEFAULT_TECHNICAL_SETTINGS;
  const role = Object.hasOwn(ROLE_LABEL, String(r.role)) ? r.role as TechnicalSettings["role"] : undefined;
  return {
    ...(role ? { role } : {}), level: r.level === "advanced" || r.level === "intermediate" ? r.level : "beginner",
    foot: r.foot === "left" || r.foot === "right" || r.foot === "both" ? r.foot : "unknown",
    side: r.side === "left" ? "left" : "right",
    ...(Object.hasOwn(FOCUS_LABEL, String(r.focus)) ? { focus: r.focus as TechnicalSettings["focus"] } : {}),
    minutes: Math.round(num(r.minutes, d.minutes, 8, 60)),
    space: { width: num(space.width, d.space.width, 8, 68), height: num(space.height, d.space.height, 8, 52.5) },
    resources: { balls: Math.floor(num(resources.balls, 1, 0, 20)), cones: Math.floor(num(resources.cones, 4, 0, 40)),
      partners: Math.floor(num(resources.partners, 0, 0, 2)), goal: resources.goal === true, wall: resources.wall === true, rebounder: resources.rebounder === true },
  };
}

export function validTechnicalResult(value: unknown): value is TechnicalResult {
  const r = obj(value), f = TECHNICAL_FAMILIES.find((f) => f.id === r.familyId);
  if (!f || r.v !== 1 || !validTechnicalDate(r.date) || typeof r.sessionId !== "string" || r.sessionId.length > 160) return false;
  if (typeof r.progressionKey !== "string" || r.progressionKey.length > 180 || !r.progressionKey.startsWith(`${f.id}|`)) return false;
  const parts = r.progressionKey.split("|");
  if (parts.length !== 5 || !f.modes.includes(parts[1] as PracticeMode) || !["left", "right"].includes(parts[2]!) || !["left", "right", "both", "unknown"].includes(parts[3]!) || !["0", "1"].includes(parts[4]!)) return false;
  if (![0, 1, 2].includes(r.stage as number) || !["easy", "right", "hard"].includes(r.difficulty as string) || r.adapted !== undefined && typeof r.adapted !== "boolean") return false;
  for (const k of ["attempts", "successes", "plannedAttempts"] as const) if (!Number.isSafeInteger(r[k]) || (r[k] as number) < 0 || (r[k] as number) > 120) return false;
  return (r.plannedAttempts as number) >= 3 && (r.attempts as number) <= (r.plannedAttempts as number) && (r.successes as number) <= (r.attempts as number);
}

/** Heurystyka produktu: dwie kompletne próby na osobnych dniach, bez udawania pomiaru techniki. */
export function progressionFor(key: string, history: TechnicalResult[], level: Level, date: string): { stage: Stage; reason: string } {
  const cap = LEVEL[level] as Stage, byDate = new Map<string, TechnicalResult>();
  for (const r of history.filter(validTechnicalResult).filter((r) => !r.adapted && r.attempts >= 3 && r.progressionKey === key && r.date < date).sort((a, b) => a.date.localeCompare(b.date))) byDate.set(r.date, r);
  const rows = [...byDate.values()], last = rows.at(-1);
  if (!last) return { stage: 0, reason: "Pierwsza ekspozycja: poznaj układ i ustal jakość wykonania." };
  let stage = Math.min(cap, last.stage) as Stage;
  if (last.attempts >= 3 && last.difficulty === "hard") return { stage: Math.max(0, stage - 1) as Stage, reason: "Zgłoszona trudność: prostszy warunek wykonania." };
  const pair = rows.slice(-2);
  const complete = (r: TechnicalResult) => r.attempts === r.plannedAttempts && r.attempts >= 6;
  if (pair.length === 2 && pair.every((r) => r.stage === stage && complete(r))) {
    if (pair.every((r) => r.successes / r.attempts >= 0.85 && r.difficulty !== "hard")) {
      stage = Math.min(cap, stage + 1) as Stage;
      return { stage, reason: "Dwa pełne wykonania z co najmniej 85% udanych prób: trudniejszy warunek, bez dokładania objętości." };
    }
    if (pair.every((r) => r.successes / r.attempts < 0.6)) return { stage: Math.max(0, stage - 1) as Stage, reason: "Dwa wykonania poniżej 60% skuteczności: uproszczenie warunku." };
  }
  return { stage, reason: "Utrzymaj warunek i popraw powtarzalność. Brak pełnych wyników nie zwiększa trudności." };
}

export function technicalDose(sets: number, reps: number, actionS: number, resetS: number, restS = 45, setupS = 60): TechnicalDose {
  return { sets, reps, actionS, resetS, restS, setupS, totalS: setupS + sets * reps * (actionS + resetS) + Math.max(0, sets - 1) * restS };
}
const hash = (s: string): number => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

function usableMode(f: TechnicalFamily, s: TechnicalSettings): PracticeMode | undefined {
  const r = s.resources;
  // Jawny priorytet; partnerzy nie są wymagani, gdy istnieje prawidłowa wersja solo.
  return f.modes.find((m) => m === "solo" || m === "wall" && r.wall || m === "rebounder" && r.rebounder || m === "partner" && r.partners >= (f.minPartners ?? 1));
}

/** Konserwatywny powrót po jedną piłkę; większy zapas piłek nie zwiększa pracy automatycznie. */
function resetEstimate(f: TechnicalFamily, mode: PracticeMode, side: TechnicalSettings["side"], route: 0 | 1): number {
  const d = technicalScene(f, mode, side, route), start = d.actors!.find((a) => a.id === "me")!;
  const ownMoves = d.arrows.filter((a) => a.actorId === "me" && ["run", "dribble", "touch"].includes(a.style));
  const lastPlayer = ownMoves.at(-1)?.points.at(-1) ?? start;
  const lastBall = d.arrows.filter((a) => a.style !== "run").at(-1)!.points.at(-1)!;
  const walk = Math.hypot(lastPlayer.x - lastBall.x, lastPlayer.y - lastBall.y) + Math.hypot(lastBall.x - start.x, lastBall.y - start.y);
  const minimum = f.intensity === "high" ? 30 : f.intensity === "moderate" ? 20 : 15;
  return Math.max(minimum, Math.ceil(walk / 1.3) + 5);
}

function constraint(f: TechnicalFamily, stage: Stage): string {
  if (f.live) return stage === 0 ? "Obrońca zaczyna od presji ograniczonej; reaguj na jego faktyczny ruch." : "Aktywny obrońca. Wybór wyjścia wynika z wolnej przestrzeni; schemat pokazuje przykład.";
  if (stage === 0) return "Poznaj trasę. Utrzymaj jakość bez limitu kontaktów.";
  if (f.goal) return stage === 1 ? "Płynne przygotowanie strzału do strefy o szerokości 1,5 m." : "Zmieniaj wariant A/B co powtórzenie; cel strzału o szerokości 1 m.";
  if (stage === 1) return f.focus === "passing" || f.focus === "receiving" ? "Pierwszy kontakt przygotowuje kolejną akcję; unikaj dodatkowego poprawiania piłki." : "Wykonaj wyjście płynnie i traf do celu zmniejszonego do 2,5 m.";
  return "Zmieniaj wariant A/B co powtórzenie. Cel 2 m; jakość i kontrola przed prędkością.";
}

function compileExercise(f: TechnicalFamily, mode: PracticeMode, request: TechnicalRequest, dose: TechnicalDose, route: 0 | 1): TechnicalExercise {
  const s = request.settings;
  const key = `${f.id}|${mode}|${s.side}|${s.foot}|${route}`;
  const progression = progressionFor(key, request.history ?? [], s.level, request.date);
  const stage = request.light ? 0 : progression.stage;
  const drill = technicalScene(f, mode, s.side, route);
  const targetWidth = f.goal ? 2 - stage * 0.5 : stage === 2 ? 2 : stage === 1 ? 2.5 : 3;
  drill.targets = drill.targets?.map((t) => ({ ...t, width: targetWidth, height: f.goal ? 1 : targetWidth }));
  if (drill.targets?.[0] && drill.cones.length >= 2) {
    const z = drill.targets[0];
    drill.cones[0] = { ...drill.cones[0]!, x: z.x - targetWidth / 2, y: z.y };
    drill.cones[1] = { ...drill.cones[1]!, x: z.x + targetWidth / 2, y: z.y };
  }
  const c = constraint(f, stage);
  drill.dose = `${dose.sets} × ${dose.reps} powt. · powrót / piłka ${dose.resetS} s · przerwa między seriami ${dose.restS} s`;
  const foot = s.foot === "left" ? "Noga wiodąca: lewa." : s.foot === "right" ? "Noga wiodąca: prawa." : "Pracuj obiema nogami, zaczynając od strony, na której kontrolujesz układ.";
  drill.points = [...drill.points, foot, c];
  const errors = validateTechnicalScene(drill);
  if (errors.length) throw new Error(`${f.id}: ${errors.join("; ")}`);
  return { familyId: f.id, progressionKey: key, mode, side: s.side, foot: s.foot, route, stage,
    stageReason: request.light ? "Lżejszy dzień: najprostszy warunek bez zmiany zapisanego poziomu." : progression.reason, adapted: !!request.light,
    focus: f.focus, roleRelevant: f.roles.length < 8, intensity: f.intensity, success: f.success, constraint: c, alternatives: [...f.alternatives],
    sources: f.sourceIds.map((id) => TECHNICAL_SOURCES.find((s) => s.id === id)!), dose, drill };
}

/** Dobór jest deterministyczny: zamknięcie ekranu nie losuje nowego treningu i niczego nie zalicza. */
export function buildTechnicalSession(raw: TechnicalRequest): TechnicalSession {
  const s = normalizeTechnicalSettings(raw.settings), roles = POSITION_ROLES[raw.position];
  const history = (raw.history ?? []).filter(validTechnicalResult).filter((r) => r.attempts > 0 && r.date < raw.date);
  const request = { ...raw, settings: s, history };
  const role = roles?.includes(s.role!) ? s.role : undefined;
  const result: TechnicalSession = { id: `technical-v2:${raw.date}:${raw.position}:${hash(JSON.stringify([s, raw.routes ?? {}]))}`, date: raw.date,
    roleLabel: role ? ROLE_LABEL[role] : roles?.map((r) => ROLE_LABEL[r]).join(" / ") ?? "Pozycja nieznana",
    status: "ready", budgetS: s.minutes * 60, totalS: 0, warmupS: 0, warmup: [], exercises: [], notes: [], exclusions: [] };
  if (!roles || !validTechnicalDate(raw.date) || !Number.isFinite(raw.age) || raw.age < 16 || raw.phase === "MD") {
    result.status = "blocked"; result.notes.push("Sesja niedostępna: sprawdź profil i datę. W dniu meczu priorytetem jest mecz."); return result;
  }
  const strain = strainOf(normalizeCheckIn(raw.checkIn));
  const light = !!raw.light || strain !== "none" || ["MD-1", "MD+1", "congested"].includes(raw.phase ?? "");
  request.light = light;
  if (light) { result.budgetS = Math.min(result.budgetS, 20 * 60); result.notes.push("Lżejszy dzień: mniej powtórzeń i spokojne wzorce, bez intensywnych pojedynków."); }
  if (!role && roles.length > 1) result.notes.push("Doprecyzuj rolę, aby zawęzić ćwiczenia dla Twojej pozycji.");
  if (s.foot === "unknown") result.notes.push("Wybierz mocniejszą nogę, aby wskazówki uwzględniały stronę wykonania.");
  const candidate: Array<{ f: TechnicalFamily; mode: PracticeMode; score: number }> = [];
  const recent = [...history].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  for (const f of TECHNICAL_FAMILIES) {
    const reasons: string[] = [], mode = usableMode(f, s);
    if (!f.roles.some((r) => role ? r === role : roles.includes(r))) reasons.push("Inna pozycja / rola.");
    if (LEVEL[f.minLevel] > LEVEL[s.level]) reasons.push("Wymagany wyższy poziom techniczny.");
    if (s.resources.balls < 1) reasons.push("Potrzebna piłka.");
    if (s.resources.cones < f.cones) reasons.push(`Potrzebne ${f.cones} stożki / znaczniki.`);
    if (f.goal && !s.resources.goal) reasons.push("Potrzebna bramka.");
    if (f.field.width > s.space.width || f.field.height > s.space.height) reasons.push(`Potrzebne pole ${f.field.width} × ${f.field.height} m.`);
    if (!mode) reasons.push(`Wymagane: ${f.modes.map((m) => m === "partner" ? `${f.minPartners ?? 1} ${f.minPartners === 2 ? "partnerów" : "partner"}` : MODE_LABEL[m]).join(" lub ")}.`);
    if (light && f.intensity !== "low" || raw.phase === "MD-2" && f.intensity === "high") reasons.push("Zbyt intensywne na dzisiejszy dzień.");
    if (reasons.length) { result.exclusions.push({ familyId: f.id, reasons }); continue; }
    const repeat = recent.filter((r) => r.familyId === f.id).length;
    const weakFocus = recent.some((r) => !r.adapted && r.attempts >= 6 && r.successes / r.attempts < 0.65 && TECHNICAL_FAMILIES.find((d) => d.id === r.familyId)?.focus === f.focus);
    const inverted = s.foot === "left" && s.side === "right" || s.foot === "right" && s.side === "left";
    const footFit = inverted && f.pattern === "inside-finish" || !inverted && s.foot !== "unknown" && f.pattern === "early-cross";
    candidate.push({ f, mode: mode!, score: (f.roles.length < 8 ? 70 : 0) + (s.focus === f.focus ? 35 : 0) + (weakFocus ? 18 : 0) + (footFit ? 12 : 0) - repeat * 12 + hash(`${raw.date}:${f.id}:${s.side}`) % 17 });
  }
  if (!candidate.length) { result.status = "unavailable"; result.notes.push("Brak wykonalnego układu dla wybranych warunków. Sprawdź przestrzeń, znaczniki i sprzęt."); return result; }
  result.warmupS = light ? 180 : 240;
  result.warmup = ["Spokojne prowadzenie piłki i stopniowe zwiększanie swobody ruchu.", "Łagodne zwroty oraz krótkie podania lub dotknięcia obiema nogami.", "Próbne przejście pierwszego układu przed rozpoczęciem serii."];
  result.totalS = result.warmupS;
  const patterns = new Set<string>(), focuses = new Map<string, number>();
  const maxBlocks = result.budgetS >= 35 * 60 ? 4 : 3;
  for (const { f, mode } of candidate.sort((a, b) => b.score - a.score || a.f.id.localeCompare(b.f.id))) {
    if (result.exercises.length >= maxBlocks) break;
    if (patterns.has(f.pattern) || (focuses.get(f.focus) ?? 0) >= 2) continue;
    if (f.intensity === "high" && result.exercises.some((e) => e.intensity === "high")) continue;
    const shotsSoFar = result.exercises.filter((e) => e.drill.arrows.some((a) => a.style === "shot")).reduce((n, e) => n + e.dose.sets * e.dose.reps, 0);
    const shooting = f.goal;
    const override = raw.routes?.[f.id];
    const route = override === 0 || override === 1 ? override : (Math.floor(recent.filter((r) => r.familyId === f.id).length / 2) % 2) as 0 | 1;
    let sets = light || raw.age < 18 ? 1 : 2, reps = light ? 4 : 6;
    const actionS = f.intensity === "low" ? 16 : f.intensity === "moderate" ? 18 : 20;
    // Czas na zebranie piłki i powrót jest częścią każdej próby; nie traktujemy całego budżetu jako pracy.
    const resetS = resetEstimate(f, mode, s.side, route);
    let dose = technicalDose(sets, reps, actionS, resetS, light ? 45 : 60, 60);
    while (dose.totalS > result.budgetS - result.totalS && (sets > 1 || reps > 3)) {
      if (sets > 1) sets--; else reps--;
      dose = technicalDose(sets, reps, actionS, resetS, light ? 45 : 60, 60);
    }
    if (dose.totalS > result.budgetS - result.totalS || shooting && shotsSoFar + sets * reps > (light || raw.age < 18 ? 12 : 24)) continue;
    result.exercises.push(compileExercise(f, mode, request, dose, route));
    result.totalS += dose.totalS; patterns.add(f.pattern); focuses.set(f.focus, (focuses.get(f.focus) ?? 0) + 1);
  }
  // Kolejność: kontrola / przyjęcie → działanie pozycyjne → wykończenie.
  const order = { control: 0, receiving: 1, passing: 2, carrying: 3, delivery: 4, finishing: 5 };
  result.exercises.sort((a, b) => order[a.focus] - order[b.focus]);
  if (!result.exercises.length) { result.status = "unavailable"; result.totalS = 0; result.warmupS = 0; result.warmup = []; result.notes.push("Za mało czasu na pełny blok wraz z przygotowaniem i przerwami."); }
  result.notes.push("Czas jest szacunkiem z przygotowaniem, przerwami i zebraniem piłki. Wyniki wpisujesz po wykonaniu.");
  return result;
}
