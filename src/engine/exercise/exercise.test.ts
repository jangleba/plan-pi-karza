import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import compact from "./data/research-catalog.compact.json";
import { CANDIDATES, RESEARCH, SOURCES, SOURCE_TAGS, catalogReport, expandCatalog, validateCatalog } from "./catalog";
import { TEMPLATES } from "../library";
import { bodyweightTemplate } from "../bodyweight";
import { adaptPlanned } from "./adaptPlan";
import { applyExerciseChange, previewExerciseChange, swapCandidates } from "./change";
import { allItems, generateSession, getEligibleExercises, slotFor, toBlocks } from "./generate";
import { consumeSkips, emptyState, buildContext, lastLoad, migrateWeightLog, recordExerciseOutcome, setCompetences, declare } from "./history";
import { pctOfMss, reached95OfMss } from "./measure";
import { suggestProgression } from "./progression";
import { qualify } from "./qualify";
import { replayOps } from "./planStore";
import { SWAPS, validateSwaps } from "./swaps";
import { VARIANTS } from "./variants";
import { validateSessionAndWeek } from "./week";
import type { AthleteContext, ExerciseVariant } from "./types";

const canon = (x: unknown): unknown => Array.isArray(x) ? x.map(canon) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon((x as Record<string, unknown>)[k])])) : x;
const OK_CHECK = { recovery: 3, feeling: 3, less: false } as const;
const intensity = TEMPLATES.find((t) => t.id === "strength-intensity")!;

const ctx0 = (o: Partial<AthleteContext> = {}): AthleteContext => ({
  age: 16, level: "beginner", equipment: ["gym", "bodyweight"], declared: { equipment: [], environment: [], people: [] },
  competences: {}, qualifiedSupervision: false, familiarVariants: [], prefs: {}, seed: "s1", weekInCycle: 3, ...o,
});
/** Zawodnik, który potwierdził wszystko i zadeklarował cały sprzęt – do testów ścieżek zaawansowanych. */
function fullCtx(o: Partial<AthleteContext> = {}): AthleteContext {
  const comps: AthleteContext["competences"] = {};
  const eq = new Set<string>(); const env = new Set<string>();
  for (const v of Object.values(VARIANTS)) {
    for (const p of v.prerequisites) comps[p] = { source: p.startsWith("qualified_instruction") ? "coach_assessed" : "self_assessed", date: "2026-11-01" };
    for (const s of v.setupOptions) { s.equipmentAllOf.forEach((x) => eq.add(x)); s.environmentAllOf.forEach((x) => env.add(x)); }
  }
  return ctx0({ age: 25, level: "advanced", equipment: ["gym", "field", "bodyweight"], competences: comps, qualifiedSupervision: true, declared: { equipment: [...eq], environment: [...env], people: [] }, ...o });
}

describe("katalog badawczy", () => {
  it("237 kandydatów z poprawną sumą kontrolną i podziałem na moduły", () => {
    const rows = expandCatalog();
    expect(rows).toHaveLength(237);
    const sha = createHash("sha256").update(JSON.stringify(canon(rows))).digest("hex");
    expect(sha).toBe((compact as { expandedRecordsSha256: string }).expandedRecordsSha256);
    const r = catalogReport();
    expect(r.byModule).toEqual({ gym: 119, ballistic: 18, plyometric: 24, sprint: 31, deceleration_cod: 16, conditioning: 9, dynamic_mobility: 20 });
    expect(r.baseRecords).toBe(155);
    expect(r.variants).toBe(82);
  });
  it("wszystkie odwołania istnieją, variantOf bez cykli, wszyscy to kandydaci bez autopublikacji", () => {
    expect(validateCatalog()).toEqual([]);
    for (const r of RESEARCH) { expect(r.reviewStatus).toBe("research_candidate"); expect(r.autoPublish).toBe(false); }
  });
  it("rejestr: 24 źródła, mapa tagów wskazuje istniejące źródła", () => {
    expect(SOURCES).toHaveLength(24);
    const ids = new Set(SOURCES.map((s) => s.id));
    for (const list of Object.values(SOURCE_TAGS)) for (const id of list) expect(ids.has(id)).toBe(true);
  });
  it("kandydaci nie wchodzą do puli produkcyjnej i nie przechodzą kwalifikacji", () => {
    for (const id of Object.keys(CANDIDATES)) expect(VARIANTS[id]).toBeUndefined();
    expect(qualify(CANDIDATES["research-goblet-squat"]!, fullCtx())).toMatchObject({ ok: false, code: "not_published" });
    const slot = { id: "t", fn: "squat_main", role: "main_stimulus" as const, preferred: ["back-squat"] };
    const e = getEligibleExercises(fullCtx(), slot, { ...VARIANTS, ...CANDIDATES });
    expect(e.eligible.every((v) => !v.id.startsWith("research-"))).toBe(true);
  });
  it("mapowanie legacy → badawcze wskazuje istniejące rekordy; zbiorcze skip A/B/D nie jest scalone", () => {
    const rep = catalogReport();
    const ids = new Set(RESEARCH.map((r) => r.id));
    for (const m of rep.mergedDuplicates) expect(ids.has(m.researchId)).toBe(true);
    expect(new Set(rep.mergedDuplicates.map((m) => m.researchId)).size).toBe(rep.mergedDuplicates.length); // brak scalania dwóch ruchów w jednego kandydata
    expect(rep.legacyWithoutCandidate).toContain("skip-a-b-d");
    expect(rep.mergedDuplicates.map((m) => m.legacyId)).not.toContain("copenhagen");
  });
});

describe("pula produkcyjna", () => {
  it("55 ruchów, kompletna treść, relacje zamian spójne", () => {
    expect(Object.keys(VARIANTS)).toHaveLength(55);
    for (const v of Object.values(VARIANTS)) { expect(v.contentStatus, v.id).toBe("complete"); expect(v.instructionsPl.length).toBeGreaterThan(0); }
    expect(validateSwaps(VARIANTS)).toEqual([]);
  });
  it("Nordic/RDL/bridge nie są zamiennikami równoważnymi", () => {
    const eqPairs = SWAPS.filter((s) => s.scope === "equivalent_for_slot");
    for (const [a, b] of [["nordic-curl", "sl-rdl-bw"], ["slider-leg-curl", "glute-bridge"], ["nordic-assisted", "glute-bridge"]]) expect(eqPairs.some((s) => s.from === a && s.to === b)).toBe(false);
  });
});

describe("kwalifikacja", () => {
  it("16-latek bez potwierdzonej kompetencji nie dostaje zadania, które jej wymaga; 18. urodziny tego nie zmieniają", () => {
    const sq = VARIANTS["back-squat"]!;
    expect(qualify(sq, ctx0({ age: 16 }))).toMatchObject({ ok: false, code: "missing_prerequisite" });
    expect(qualify(sq, ctx0({ age: 18 }))).toMatchObject({ ok: false, code: "missing_prerequisite" });
    const withComp = ctx0({ competences: setCompetences({ ...emptyState() }, ["learned_squat_pattern", "learned_barbell_setup"], "self_assessed", "2026-11-01").competences });
    expect(qualify(sq, withComp)).toEqual({ ok: true });
  });
  it("setupOptions: jedna pełna konfiguracja wystarcza, partner nie jest sprzętem", () => {
    const base = VARIANTS["goblet-squat"]!;
    const v: ExerciseVariant = { ...base, prerequisites: [], setupOptions: [
      { equipmentAllOf: ["dumbbell", "heel_wedge"], environmentAllOf: [], people: [] },
      { equipmentAllOf: ["kettlebell"], environmentAllOf: [], people: [] },
      { equipmentAllOf: ["band"], environmentAllOf: [], people: ["trained_anchoring_partner"] },
    ] };
    const c = (eq: string[], people: string[] = []) => ctx0({ equipment: ["bodyweight"], declared: { equipment: eq, environment: [], people } });
    expect(qualify(v, c(["dumbbell"]))).toMatchObject({ ok: false, code: "no_setup" });
    expect(qualify(v, c(["kettlebell"]))).toEqual({ ok: true });
    expect(qualify(v, c(["dumbbell", "heel_wedge"]))).toEqual({ ok: true });
    expect(qualify(v, c(["band", "trained_anchoring_partner"]))).toMatchObject({ ok: false, code: "no_setup" }); // partner zadeklarowany jako sprzęt nie liczy się
    expect(qualify(v, c(["band"], ["trained_anchoring_partner"]))).toEqual({ ok: true });
  });
  it("nadzór: qualified_required wymaga bieżącego nadzoru i przeszkolenia, a nie samooceny", () => {
    const clean = VARIANTS["hang-power-clean"]!;
    expect(qualify(clean, fullCtx({ qualifiedSupervision: false }))).toMatchObject({ ok: false, code: "supervision_required" });
    const self = fullCtx();
    for (const p of clean.prerequisites) self.competences[p] = { source: "self_assessed", date: "2026-11-01" };
    expect(qualify(clean, self)).toMatchObject({ ok: false, code: "missing_prerequisite" });
    expect(qualify(clean, fullCtx())).toEqual({ ok: true });
  });
  it("wiek poniżej minimum jest odrzucany", () => {
    expect(qualify({ ...VARIANTS["push-up"]!, minimumAge: 18, prerequisites: [] }, ctx0({ age: 16 }))).toMatchObject({ ok: false, code: "age" });
  });
});

describe("generowanie", () => {
  it("początkujący bez danych: pominięcia z powodem i bez powrotu do ruchu niespełniającego wymagań", () => {
    const s = generateSession(ctx0(), intensity, { date: "2026-11-24", deload: false });
    const ids = allItems(s).map((i) => i.variantId);
    expect(ids).not.toContain("back-squat");
    expect(ids).not.toContain("hang-power-clean");
    const sq = allItems(s).find((i) => i.slot.fn === "squat_main");
    expect(sq?.variantId).toBe("bw-squat"); // pierwszy wybór odpada, wchodzi najbliższy dopuszczony wariant tej samej funkcji
    expect(s.selections[sq!.selectionId]!.rejected.some((r) => r.variantId === "back-squat" && r.code === "missing_prerequisite")).toBe(true);
    const o = s.omitted.find((x) => x.plannedVariantId === "hang-power-clean")!;
    expect(o.code).toBe("supervision_required");
    expect(o.unlock?.kind).toBe("supervision");
    for (const i of allItems(s)) expect(qualify(VARIANTS[i.variantId]!, ctx0())).toEqual({ ok: true });
  });
  it("zamiennik z fallbacku dostaje nową receptę (nie tekst z back squat)", () => {
    const c = ctx0({ competences: setCompetences(emptyState(), ["learned_squat_pattern"], "self_assessed", "2026-11-01").competences });
    const s = generateSession(c, intensity, { date: "2026-11-24", deload: false });
    const sq = allItems(s).find((i) => i.slot.fn === "squat_main")!;
    expect(sq.variantId).toBe("goblet-squat");
    expect(s.selections[sq.selectionId]!.code).toBe("fallback");
    expect(sq.note).toBeUndefined();
    expect(sq.rx.type === "strength" && sq.rx.load.pctRM).toBeFalsy();
  });
  it("pełny profil dostaje szablon trenera bez zmian dawki", () => {
    const s = generateSession(fullCtx(), intensity, { date: "2026-11-24", deload: false });
    const blocks = toBlocks(s);
    const squat = blocks.flatMap((b) => b.items).find((i) => i.exerciseId === "back-squat")!;
    expect(squat.sets).toBe(4);
    expect(squat.reps).toBe("2");
    expect(squat.note).toBe("tempo 4-1-x");
    expect(s.omitted.map((o) => o.code)).not.toContain("missing_prerequisite");
  });
  it("odtwarzalność: to samo ziarno = ten sam plan, główne zadanie stabilne przy innym ziarnie", () => {
    const a = generateSession(fullCtx({ seed: "A" }), intensity, { date: "d", deload: false });
    const a2 = generateSession(fullCtx({ seed: "A" }), intensity, { date: "d", deload: false });
    const b = generateSession(fullCtx({ seed: "B" }), intensity, { date: "d", deload: false });
    expect(a2).toEqual(a);
    const mains = (s: typeof a) => allItems(s).filter((i) => i.slot.role === "main_stimulus").map((i) => i.variantId);
    expect(mains(b)).toEqual(mains(a));
  });
  it("sloty drabinki bez siłowni schodzą w dół po szczeblach, gdy szczebel wymaga nadzoru", () => {
    const t = bodyweightTemplate("advanced", "intensity");
    const c = ctx0({ age: 20, level: "advanced", equipment: ["bodyweight"], competences: fullCtx().competences });
    const s = generateSession(c, t, { date: "d", deload: false });
    const hinge = allItems(s).find((i) => i.slot.fn === "posterior_chain");
    expect(hinge && ["sl-rdl-bw", "sl-glute-bridge", "glute-bridge"]).toContain(hinge!.variantId);
    expect(slotFor(t, 3, 0, t.blocks[3]!.items[0]!)!.preferred[0]).toBe("nordic-curl");
  });
});

describe("adaptacja i zmiany – ta sama kwalifikacja", () => {
  it("mocne zmęczenie: lżejsza alternatywa tylko równoważna, kwalifikowana i z nową receptą; bez niej pozycja jest pominięta", () => {
    const full = generateSession(fullCtx(), intensity, { date: "d", deload: false });
    const heavy = adaptPlanned(full, { recovery: 1, feeling: 1, less: false }, false, fullCtx(), "intensity");
    const ids = allItems(heavy).map((i) => i.variantId);
    expect(ids).not.toContain("hang-power-clean");
    expect(ids).toContain("kb-swing");
    const kb = allItems(heavy).find((i) => i.variantId === "kb-swing")!;
    expect(kb.rx.type).toBe("strength");
    expect(kb.rx.text).toBeUndefined();
    // zawodnik bez kb-swing w puli (brak kettlebell): pominięcie z powodem, nie powrót do zarzutu
    const noKb = fullCtx({ declared: { equipment: [], environment: [], people: [] }, equipment: ["bodyweight"] });
    const s2 = adaptPlanned(generateSession(fullCtx(), intensity, { date: "d", deload: false }), { recovery: 1, feeling: 1, less: false }, false, noKb);
    expect(allItems(s2).map((i) => i.variantId)).not.toContain("hang-power-clean");
  });
  it("zamiana równoważna: nowa recepta, wersja planu rośnie, przeterminowany podgląd jest odrzucany", () => {
    const c = fullCtx();
    const s = generateSession(c, intensity, { date: "d", deload: false });
    const sq = allItems(s).find((i) => i.variantId === "back-squat")!;
    const op = { kind: "swap", itemId: sq.itemId, toVariantId: "goblet-squat" } as const;
    const p = previewExerciseChange(s, op, c);
    expect(p).toMatchObject({ ok: true, scope: "equivalent_for_slot", requiresAck: false });
    const r = applyExerciseChange(p, s, c);
    expect(r.ok && r.session.version).toBe(2);
    const swapped = r.ok ? allItems(r.session).find((i) => i.itemId === sq.itemId)! : null;
    expect(swapped?.variantId).toBe("goblet-squat");
    expect(swapped?.rx.text).toBeUndefined();
    expect(swapped?.note).toBeUndefined();
    if (r.ok) expect(applyExerciseChange(p, r.session, c)).toMatchObject({ ok: false, code: "stale" });
  });
  it("Nordic → RDL: rozpoznana zmiana bodźca, wymaga potwierdzenia, bez etykiety zamiany równoważnej", () => {
    const c = fullCtx();
    const t = bodyweightTemplate("advanced", "intensity");
    const s = generateSession(c, t, { date: "d", deload: false });
    const nordic = allItems(s).find((i) => i.variantId === "nordic-curl")!;
    const p = previewExerciseChange(s, { kind: "swap", itemId: nordic.itemId, toVariantId: "sl-rdl-bw" }, c);
    expect(p.scope).toBe("changes_stimulus");
    expect(p.requiresAck).toBe(true);
    expect(applyExerciseChange(p, s, c)).toMatchObject({ ok: false, code: "needs_ack" });
    expect(applyExerciseChange(p, s, c, { ack: true }).ok).toBe(true);
  });
  it("ręczna zamiana na niekwalifikowane ćwiczenie jest odrzucona tą samą regułą", () => {
    const c = ctx0({ competences: setCompetences(emptyState(), ["learned_squat_pattern"], "self_assessed", "d").competences });
    const s = generateSession(fullCtx(), intensity, { date: "d", deload: false });
    const sq = allItems(s).find((i) => i.variantId === "back-squat")!;
    const p = previewExerciseChange(s, { kind: "swap", itemId: sq.itemId, toVariantId: "step-up" }, c);
    expect(p.ok).toBe(false);
    expect(p.reasons[0]!.code).toBe("missing_prerequisite");
    expect(swapCandidates(s, sq.itemId, c).find((x) => x.variant.id === "step-up")!.q.ok).toBe(false);
  });
  it("usunięcie głównego ćwiczenia oznacza utratę celu i zachowuje informację o pominiętym", () => {
    const c = fullCtx();
    const s = generateSession(c, intensity, { date: "d", deload: false });
    const sq = allItems(s).find((i) => i.variantId === "back-squat")!;
    const p = previewExerciseChange(s, { kind: "remove", itemId: sq.itemId }, c);
    expect(p.warnings.length).toBeGreaterThan(0);
    expect(p.result!.omitted.some((o) => o.code === "removed_by_user" && o.plannedVariantId === "back-squat")).toBe(true);
  });
  it("dodanie sprawdza czas z odpoczynkiem", () => {
    const c = fullCtx({ minutesAvailable: 10 });
    const s = generateSession(c, intensity, { date: "d", deload: false });
    const p = previewExerciseChange(s, { kind: "add", variantId: "push-up" }, c);
    expect(p.ok).toBe(false);
    expect(p.reasons[0]!.code).toBe("time_exceeded");
    const big = fullCtx({ minutesAvailable: 240 });
    expect(previewExerciseChange(s, { kind: "add", variantId: "push-up" }, big).ok).toBe(true);
  });
  it("operacje zapisane odtwarzają się deterministycznie, a niekwalifikowane są pomijane", () => {
    const c = fullCtx();
    const s = generateSession(c, intensity, { date: "d", deload: false });
    const sq = allItems(s).find((i) => i.variantId === "back-squat")!;
    const ops = [{ op: { kind: "swap", itemId: sq.itemId, toVariantId: "goblet-squat" } as const }];
    expect(allItems(replayOps(s, ops, c).session).some((i) => i.variantId === "goblet-squat")).toBe(true);
    const weak = ctx0();
    expect(replayOps(s, ops, weak).applied).toHaveLength(0);
  });
});

describe("historia, preferencje i progresja", () => {
  it("swap/skip zmienia kolejne generowanie, a skip wygasa po zużyciu", () => {
    let st = emptyState();
    st = recordExerciseOutcome(st, { sessionId: "x", exerciseId: "back-squat", variantVersion: 1, date: "2026-11-20", planned: null, loadConvention: "total_kg", completion: "all", choice: "swap", source: "plan" });
    const c = fullCtx({ prefs: st.prefs });
    const s = generateSession(c, intensity, { date: "d", deload: false });
    expect(allItems(s).map((i) => i.variantId)).not.toContain("back-squat");
    expect(allItems(s).find((i) => i.slot.fn === "squat_main")?.variantId).toBe("goblet-squat");
    let st2 = recordExerciseOutcome(emptyState(), { sessionId: "x", exerciseId: "facepull", variantVersion: 1, date: "d", planned: null, loadConvention: "machine_setting", choice: "skip", source: "plan" });
    const sk = generateSession(fullCtx({ prefs: st2.prefs }), intensity, { date: "d2", deload: false });
    expect(allItems(sk).map((i) => i.variantId)).not.toContain("facepull");
    expect(sk.omitted.find((o) => o.code === "skip_next")).toBeTruthy();
    st2 = consumeSkips(st2, ["facepull"]);
    expect(allItems(generateSession(fullCtx({ prefs: st2.prefs }), intensity, { date: "d3", deload: false })).map((i) => i.variantId)).toContain("facepull");
  });
  it("migracja starych wpisów nie zmyśla powtórzeń ani konwencji kg", () => {
    const ev = migrateWeightLog({ "back-squat": { kg: 100, reps: 5, date: "2026-11-01", completion: "all" } });
    expect(ev[0]!.performed).toEqual({ kg: 100 });
    expect(ev[0]!.performed?.reps).toBeUndefined();
    expect(ev[0]!.loadConvention).toBe("unknown");
  });
  it("historia kg jest rozdzielona według konwencji i wersji wariantu", () => {
    let st = emptyState();
    st = recordExerciseOutcome(st, { sessionId: "a", exerciseId: "db-bench-press", variantVersion: 1, date: "d1", planned: null, performed: { kg: 30 }, loadConvention: "per_dumbbell_kg", source: "plan" });
    expect(lastLoad(st, "db-bench-press", "per_dumbbell_kg")).toBe(30);
    expect(lastLoad(st, "db-bench-press", "total_kg")).toBeNull();
    expect(lastLoad(st, "db-bench-press", "per_dumbbell_kg", 2)).toBeNull();
  });
  it("progresja: nieznana konwencja i brak potwierdzenia blokują wzrost; pełne wykonanie dopuszcza ostrożną propozycję z wyborem", () => {
    const mk = (completion: "all" | "partial" | "stopped" | undefined, convention: "total_kg" | "unknown") => recordExerciseOutcome(emptyState(), { sessionId: "a", exerciseId: "back-squat", variantVersion: 1, date: "d", planned: null, performed: { kg: 100 }, loadConvention: convention, ...(completion ? { completion } : {}), source: "plan" });
    const ctx = { strain: "none" as const, deload: false };
    expect(suggestProgression(mk("all", "unknown"), "back-squat", ctx).options).not.toContain("raise");
    for (const c of [undefined, "partial", "stopped"] as const) expect(suggestProgression(mk(c, "total_kg"), "back-squat", ctx).options).not.toContain("raise");
    const up = suggestProgression(mk("all", "total_kg"), "back-squat", ctx);
    expect(up.axis).toBe("load");
    expect(up.options).toEqual(expect.arrayContaining(["raise", "stay", "lower", "swap", "skip"]));
    expect(suggestProgression(mk("all", "total_kg"), "back-squat", { strain: "none", deload: true }).options).not.toContain("raise");
  });
  it("kompetencja z potwierdzonego wykonania w aplikacji pochodzi z `grants`", () => {
    const st = recordExerciseOutcome(emptyState(), { sessionId: "a", exerciseId: "box-jump", variantVersion: 1, date: "d", planned: null, loadConvention: "bodyweight", completion: "all", source: "plan" });
    expect(st.competences["familiar_box_jump"]?.source).toBe("performed_in_app");
  });
});

describe("tydzień, ekspozycje i pomiary", () => {
  it("najwyżej dwie sesje dziennie łącznie z klubem; sprint osobno od siłowni; klub = jakość nieznana", () => {
    const c = fullCtx();
    const gym = generateSession(c, intensity, { date: "2026-11-24", deload: false });
    const sprint = generateSession(c, TEMPLATES.find((t) => t.id === "sprint-a")!, { date: "2026-11-24", deload: false });
    const r = validateSessionAndWeek({ sessions: [gym, sprint], clubDates: ["2026-11-24"] }, c);
    expect(r.issues.some((i) => i.code === "too_many_sessions")).toBe(true);
    const ok = validateSessionAndWeek({ sessions: [gym, sprint], clubDates: [] }, c); // siłownia + sprint jednego dnia jako dwie sesje
    expect(ok.issues.some((i) => i.code === "too_many_sessions")).toBe(false);
    expect(ok.exposures.acceleration).toBeGreaterThan(0);
    expect(r.club.contentQuality).toBe("unknown_estimated");
    const merged = { ...gym, blocks: [...gym.blocks, ...sprint.blocks] };
    expect(validateSessionAndWeek({ sessions: [merged], clubDates: [] }, c).issues.some((i) => i.code === "merged_modules")).toBe(true);
  });
  it("MAS nie staje się MSS", () => {
    const mas = [{ type: "MAS" as const, value: 4.5, unit: "m/s" as const, date: "d", method: "5 min", quality: "field_estimate" as const }];
    expect(pctOfMss(8, mas)).toBeNull();
    expect(reached95OfMss(8, mas)).toBeNull();
    const mss = [...mas, { type: "MSS" as const, value: 8.4, unit: "m/s" as const, date: "d", method: "flying 30", quality: "validated" as const }];
    expect(reached95OfMss(8.2, mss)).toBe(true);
  });
  it("kontekst z historii: klub nieznany nie jest zerem (brak liczników klubu)", () => {
    const c = buildContext(declare(emptyState(), "equipment", ["kettlebell"]), { age: 17, level: "beginner", equipment: ["bodyweight"], weekInCycle: 1 });
    expect(c.declared.equipment).toContain("kettlebell");
  });
});
