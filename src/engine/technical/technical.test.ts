import { describe, expect, it } from "vitest";
import { TECHNICAL_FAMILIES } from "./catalog";
import { technicalScene, TECHNICAL_REFERENCE_DRILLS } from "./scene";
import { validateTechnicalScene } from "./validate";
import { buildTechnicalSession, normalizeTechnicalSettings, progressionFor, validTechnicalResult } from "./planner";
import { buildTimeline, stateAt } from "../drillAnim";
import { placeDrill } from "../halfPitch";
import type { TechnicalRequest, TechnicalResult } from "./types";

const request = (patch: Partial<TechnicalRequest> = {}): TechnicalRequest => ({ position: "skrzydlowy", age: 22, date: "2026-11-22", settings: {
  level: "advanced", role: "winger", foot: "left", side: "right", minutes: 40,
  space: { width: 68, height: 52.5 }, resources: { balls: 3, cones: 8, goal: true, wall: true, rebounder: true, partners: 2 },
}, ...patch });
const result = (patch: Partial<TechnicalResult> = {}): TechnicalResult => ({ v: 1, sessionId: "s", familyId: "wing-wall-finish", progressionKey: "wing-wall-finish|rebounder|right|left|0", date: "2026-11-19", stage: 0, attempts: 12, successes: 11, plannedAttempts: 12, difficulty: "right", ...patch });

describe("technika pozycyjna — geometria i przebieg", () => {
  it("każda wersja ma fizycznie spójny przebieg, instrukcje i rzeczywisty obiekt odbijający", () => {
    expect(TECHNICAL_FAMILIES).toHaveLength(25);
    expect(new Set(TECHNICAL_REFERENCE_DRILLS.map((d) => d.id)).size).toBe(TECHNICAL_REFERENCE_DRILLS.length);
    for (const d of TECHNICAL_REFERENCE_DRILLS) {
      expect(validateTechnicalScene(d), d.id).toEqual([]);
      const place = placeDrill(d);
      for (const a of d.arrows) for (const p of a.points) {
        const q = place.map(p);
        expect(q.x, d.id).toBeGreaterThanOrEqual(0); expect(q.x, d.id).toBeLessThanOrEqual(68);
        expect(q.y, d.id).toBeGreaterThanOrEqual(0); expect(q.y, d.id).toBeLessThanOrEqual(52.5);
      }
      const tl = buildTimeline(d);
      expect(Number.isFinite(tl.total) && tl.total > 0).toBe(true);
      for (let t = 0; t < tl.total; t += 0.4) {
        const st = stateAt(d, tl, t);
        for (const p of [st.ball, ...Object.values(st.players ?? {})]) if (p) {
          expect(p.x).toBeGreaterThanOrEqual(0); expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(d.field.width); expect(p.y).toBeLessThanOrEqual(d.field.height);
        }
      }
    }
  });
  it("odrzuca teleportację piłki i dwie równoczesne akcje piłką", () => {
    const f = TECHNICAL_FAMILIES.find((f) => f.id === "wing-wall-finish")!;
    const d = technicalScene(f, "rebounder", "right", 0);
    const returning = d.arrows.find((a) => a.actorId === "bounce")!;
    returning.points[0] = { x: 1, y: 1 };
    expect(validateTechnicalScene(d).some((e) => e.includes("Teleportacja"))).toBe(true);
    returning.step = 1;
    expect(validateTechnicalScene(d).some((e) => e.includes("Dwie akcje"))).toBe(true);
  });
  it("podanie zwrotne i bieg odbywają się równocześnie, obaj wykonawcy zachowują ciągłość", () => {
    const d = technicalScene(TECHNICAL_FAMILIES.find((f) => f.id === "wing-wall-finish")!, "partner", "right", 0);
    const tl = buildTimeline(d), group = tl.segs.filter((s) => d.arrows[s.arrow]!.step === 2);
    expect(group).toHaveLength(2); expect(group[0]!.t0).toBe(group[1]!.t0); expect(group[0]!.t1).toBe(group[1]!.t1);
    const a = stateAt(d, tl, group[0]!.t0), b = stateAt(d, tl, (group[0]!.t0 + group[0]!.t1) / 2);
    expect(a.player).not.toEqual(b.player); expect(a.ball).not.toEqual(b.ball);
    expect(a.players!.server).toEqual(b.players!.server);
  });
  it("odbicie lustrzane zachowuje wszystkie odległości i zmienia każdą warstwę sceny", () => {
    const f = TECHNICAL_FAMILIES.find((f) => f.id === "wing-wall-finish")!;
    const a = technicalScene(f, "rebounder", "right", 0), b = technicalScene(f, "rebounder", "left", 0);
    expect(a.ballStart!.x + b.ballStart!.x).toBe(f.field.width);
    for (let i = 0; i < a.arrows.length; i++) for (let j = 0; j < a.arrows[i]!.points.length; j++) expect(a.arrows[i]!.points[j]!.x + b.arrows[i]!.points[j]!.x).toBeCloseTo(f.field.width);
  });
});

describe("technika — dobór i budżet", () => {
  it("ograniczenia sprzętu są twarde: żadne podanie zwrotne bez partnera / powierzchni", () => {
    const r = request(); r.settings.resources = { balls: 1, cones: 4, goal: false, wall: false, rebounder: false, partners: 0 };
    const plan = buildTechnicalSession(r);
    expect(plan.status).toBe("ready"); expect(plan.exercises.length).toBeGreaterThan(0);
    for (const e of plan.exercises) { expect(e.mode).toBe("solo"); expect(e.drill.goals).toBeUndefined(); expect(e.drill.stations).toEqual([]); expect(e.drill.actors).toHaveLength(1); }
    expect(plan.exclusions.find((e) => e.familyId === "wing-wall-finish")!.reasons.length).toBeGreaterThan(0);
  });
  it("dla każdej pozycji, poziomu, wieku, przestrzeni i czasu respektuje budżet i unikalność wzorców", () => {
    for (const position of ["bramkarz", "obronca", "pomocnik", "skrzydlowy", "napastnik"] as const)
      for (const minutes of [8, 12, 20, 30, 45, 60]) for (const age of [16, 28]) for (const level of ["beginner", "advanced"] as const) {
        const r = request({ position, age }); r.settings = { ...r.settings, role: undefined, level, minutes };
        const plan = buildTechnicalSession(r);
        expect(plan.totalS).toBeLessThanOrEqual(plan.budgetS);
        expect(plan.totalS).toBe(plan.warmupS + plan.exercises.reduce((n, e) => n + e.dose.totalS, 0));
        expect(new Set(plan.exercises.map((e) => TECHNICAL_FAMILIES.find((f) => f.id === e.familyId)!.pattern)).size).toBe(plan.exercises.length);
        if (position === "bramkarz") expect(plan.exercises.every((e) => !e.drill.arrows.some((a) => a.style === "shot"))).toBe(true);
      }
  });
  it("dla dokładnej roli nie wybiera ćwiczeń innej roli", () => {
    const r = request({ position: "pomocnik" }); r.settings.role = "six";
    const plan = buildTechnicalSession(r);
    expect(plan.exercises.some((e) => e.roleRelevant)).toBe(true);
    for (const e of plan.exercises) expect(TECHNICAL_FAMILIES.find((f) => f.id === e.familyId)!.roles).toContain("six");
  });
  it("dzień meczu blokuje sesję, MD-1 i słaby check-in usuwają intensywne ćwiczenia", () => {
    expect(buildTechnicalSession(request({ phase: "MD" })).status).toBe("blocked");
    for (const r of [request({ phase: "MD-1" }), request({ checkIn: { recovery: 1, feeling: 1, less: true } })]) {
      const p = buildTechnicalSession(r); expect(p.budgetS).toBeLessThanOrEqual(1200);
      expect(p.exercises.every((e) => e.intensity === "low" && e.dose.sets === 1 && e.stage === 0)).toBe(true);
    }
  });
  it("brak piłki, za małe pole i nieprawidłowa data dają jawny stan zamiast wymyślonego treningu", () => {
    const r = request(); r.settings.resources.balls = 0;
    expect(buildTechnicalSession(r)).toMatchObject({ status: "unavailable", totalS: 0, exercises: [] });
    r.settings.resources.balls = 1; r.settings.space = { width: 8, height: 8 };
    expect(buildTechnicalSession(r).status).toBe("unavailable");
    expect(buildTechnicalSession(request({ date: "2026-02-31" })).status).toBe("blocked");
  });
  it("deterministyczny plan i brak mutacji wejścia / biblioteki", () => {
    const r = request(), snapshot = JSON.stringify(r), catalog = JSON.stringify(TECHNICAL_FAMILIES);
    expect(buildTechnicalSession(r)).toEqual(buildTechnicalSession(r));
    expect(JSON.stringify(r)).toBe(snapshot); expect(JSON.stringify(TECHNICAL_FAMILIES)).toBe(catalog);
  });
});

describe("technika — progresja i dane niezaufane", () => {
  it("zwiększa warunek po dwóch pełnych wykonaniach na różnych dniach, bez dodawania objętości", () => {
    const h = [result(), result({ date: "2026-11-21" })];
    expect(progressionFor(h[0]!.progressionKey, h, "advanced", "2026-11-22").stage).toBe(1);
    expect(progressionFor(h[0]!.progressionKey, h, "beginner", "2026-11-22").stage).toBe(0);
    const r = request({ history: h }), p = buildTechnicalSession(r);
    for (const e of p.exercises) expect(e.dose.reps).toBeLessThanOrEqual(6);
  });
  it("nie zwiększa po samym otwarciu, małej próbie, dwóch zapisach tego samego dnia ani wyniku z przyszłości", () => {
    const key = result().progressionKey;
    for (const h of [[], [result(), result()], [result({ attempts: 2, successes: 2 }), result({ date: "2026-11-21" })], [result(), result({ date: "2026-11-25" })]]) expect(progressionFor(key, h, "advanced", "2026-11-22").stage).toBe(0);
    expect(progressionFor(key, [result({ stage: 1, difficulty: "hard" })], "advanced", "2026-11-22").stage).toBe(0);
  });
  it("nie przenosi progresji pomiędzy nogami, stronami i trybami", () => {
    const h = [result(), result({ date: "2026-11-21" })];
    expect(progressionFor("wing-wall-finish|partner|right|left|0", h, "advanced", "2026-11-22").stage).toBe(0);
    expect(progressionFor("wing-wall-finish|rebounder|left|left|0", h, "advanced", "2026-11-22").stage).toBe(0);
  });
  it("lżejszy trening nie kasuje wypracowanego etapu i nie zalicza awansu", () => {
    const h = [result({ stage: 1 }), result({ stage: 1, date: "2026-11-20" }), result({ stage: 0, date: "2026-11-21", adapted: true, difficulty: "hard" })];
    expect(progressionFor(result().progressionKey, h, "advanced", "2026-11-22").stage).toBe(2);
  });
  it("odrzuca nieprawidłowe wyniki, a uszkodzone ustawienia nie odblokowują sprzętu", () => {
    expect(validTechnicalResult(result({ successes: 13 }))).toBe(false);
    expect(validTechnicalResult(result({ attempts: -1 }))).toBe(false);
    expect(validTechnicalResult(result({ progressionKey: "wing-wall-finish|magic" }))).toBe(false);
    const s = normalizeTechnicalSettings({ level: "elite", minutes: NaN, resources: { partners: Infinity, goal: "true", wall: 1 }, space: { width: -20, height: NaN } });
    expect(s.level).toBe("beginner"); expect(s.resources).toMatchObject({ partners: 0, goal: false, wall: false });
    expect(s.minutes).toBe(25); expect(s.space.width).toBe(8);
  });
});
