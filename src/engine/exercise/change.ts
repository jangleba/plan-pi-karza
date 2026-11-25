import { allItems } from "./generate";
import { qualify } from "./qualify";
import { POLICY_VERSION, prescribe } from "./rx";
import { findSwap, swapsFrom, type SwapScope } from "./swaps";
import { VARIANTS } from "./variants";
import { validateSession, type Issue } from "./week";
import type { AthleteContext, GeneratedSession, Omitted, RxPhase, PlannedItem, Selection, Slot } from "./types";

export type Operation =
  | { kind: "add"; variantId: string; blockIndex?: number }
  | { kind: "remove"; itemId: string }
  | { kind: "swap"; itemId: string; toVariantId: string }
  | { kind: "changeVariant"; itemId: string; toVariantId: string };

export interface ChangePreview {
  ok: boolean;
  op: Operation;
  basePlanVersion: number;
  reasons: Array<{ code: string; messagePl: string }>;
  /** Zakres zmiany (tylko zamiana): equivalent_for_slot nie wymaga przebudowy, pozostałe tak. */
  scope?: SwapScope;
  requiresAck: boolean;
  warnings: string[];
  issues: Issue[];
  /** Co zmieni się w historii/rekomendacjach: np. zmiana wariantu rozdziela historię. */
  result?: GeneratedSession;
}

const fail = (op: Operation, s: GeneratedSession, code: string, messagePl: string): ChangePreview =>
  ({ ok: false, op, basePlanVersion: s.version, reasons: [{ code, messagePl }], requiresAck: false, warnings: [], issues: [] });

function phaseOf(s: GeneratedSession): RxPhase { return s.templateId.includes("intensity") ? "intensity" : "volume"; }
const find = (s: GeneratedSession, id: string) => allItems(s).find((i) => i.itemId === id);
const mapItems = (s: GeneratedSession, f: (i: PlannedItem) => PlannedItem | null): GeneratedSession => ({
  ...s, blocks: s.blocks.map((b) => ({ ...b, items: b.items.flatMap((i) => { const r = f(i); return r ? [r] : []; }) })).filter((b) => b.items.length),
});
const note = (s: GeneratedSession, id: string, code: Selection["code"], reasonPl: string, variantId: string, slot: Slot, itemId: string): Selection =>
  ({ id, itemId, slotId: slot.id, variantId, code, reasonPl, rejected: [], policyVersion: POLICY_VERSION, seed: "user" });

/**
 * Podgląd zmiany. Ten sam walidator (kwalifikacja + walidacja sesji) jest używany przy `apply`.
 * Zamiana wymaga zatwierdzonej relacji; brak relacji przy innej funkcji to zmiana bodźca (nigdy „równoważna”).
 */
export function previewExerciseChange(session: GeneratedSession, op: Operation, ctx: AthleteContext): ChangePreview {
  const base = { op, basePlanVersion: session.version, reasons: [] as ChangePreview["reasons"], requiresAck: false, warnings: [] as string[] };
  const phase = phaseOf(session);

  if (op.kind === "add") {
    const v = VARIANTS[op.variantId];
    if (!v) return fail(op, session, "unknown_variant", "Nie znamy takiego ćwiczenia.");
    if (allItems(session).some((i) => i.variantId === v.id)) return fail(op, session, "duplicate", "To ćwiczenie jest już w sesji.");
    const q = qualify(v, ctx);
    if (!q.ok) return fail(op, session, q.code, q.messagePl);
    const role = v.roles.includes("accessory") ? "accessory" : v.roles[0]!;
    const slot: Slot = { id: `added/${v.id}`, fn: v.functions[0] ?? "unknown", role, preferred: [v.id], blockTitle: "Dodatkowe" };
    const itemId = `${session.date}:${slot.id}`;
    const selId = `sel:${itemId}`;
    const item: PlannedItem = { itemId, slot, variantId: v.id, variantVersion: v.version, rx: prescribe(v, role, phase), selectionId: selId };
    const blocks = [...session.blocks];
    const bi = op.blockIndex !== undefined && blocks[op.blockIndex] ? op.blockIndex : -1;
    if (bi >= 0) blocks[bi] = { ...blocks[bi]!, items: [...blocks[bi]!.items, item] };
    else blocks.push({ title: "Dodatkowe", items: [item] });
    const result: GeneratedSession = { ...session, blocks, selections: { ...session.selections, [selId]: note(session, selId, "user_added", "Dodane przez Ciebie.", v.id, slot, itemId) } };
    const issues = validateSession(result, ctx);
    const blocking = issues.find((x) => x.severity === "block");
    return { ...base, ok: !blocking, reasons: blocking ? [{ code: blocking.code, messagePl: blocking.messagePl }] : [], issues, result };
  }

  const cur = find(session, op.itemId);
  if (!cur) return fail(op, session, "no_item", "Tego ćwiczenia nie ma już w sesji.");

  if (op.kind === "remove") {
    const out: Omitted = { itemId: cur.itemId, slot: cur.slot, plannedVariantId: cur.variantId, code: "removed_by_user", messagePl: "Usunięte przez Ciebie." };
    const result = { ...mapItems(session, (i) => (i.itemId === cur.itemId ? null : i)), omitted: [...session.omitted, out] };
    const issues = validateSession(result, ctx);
    const lost = issues.find((x) => x.code === "goal_uncovered");
    return { ...base, ok: true, warnings: lost ? [lost.messagePl] : [], issues, result };
  }

  const to = VARIANTS[op.toVariantId];
  if (!to) return fail(op, session, "unknown_variant", "Nie znamy takiego ćwiczenia.");
  if (to.id === cur.variantId) return fail(op, session, "same", "To już jest wybrane ćwiczenie.");
  if (allItems(session).some((i) => i.variantId === to.id)) return fail(op, session, "duplicate", "To ćwiczenie jest już w sesji.");
  const q = qualify(to, ctx);
  if (!q.ok) return fail(op, session, q.code, q.messagePl);
  const from = VARIANTS[cur.variantId]!;

  let scope: SwapScope | undefined;
  const warnings: string[] = [];
  if (op.kind === "swap") {
    const rel = findSwap(cur.variantId, to.id, cur.slot.fn);
    if (rel) { scope = rel.scope; if (rel.scope !== "equivalent_for_slot") warnings.push(rel.rationalePl); }
    else if (!to.functions.includes(cur.slot.fn)) {
      scope = "changes_stimulus";
      warnings.push(`To zmienia bodziec: ${from.namePl} → ${to.namePl} (inny cel niż w tym miejscu sesji).`);
    } else return fail(op, session, "no_relation", "Brak zatwierdzonej zamiany między tymi ćwiczeniami. Wybierz zamiennik z listy.");
  } else {
    if (from.family !== to.family && !(findSwap(from.id, to.id))) return fail(op, session, "other_family", "Zmiana wariantu dotyczy tej samej rodziny ruchu.");
    warnings.push("Historia obciążeń zostaje przypisana do właściwego wariantu – nowy wariant zaczyna własną.");
  }
  const requiresAck = scope !== undefined && scope !== "equivalent_for_slot";
  const slot: Slot = scope === "equivalent_for_slot" || op.kind === "changeVariant" ? cur.slot : { ...cur.slot, fn: to.functions[0] ?? cur.slot.fn };
  const selId = `sel:${cur.itemId}`;
  const item: PlannedItem = { ...cur, slot, variantId: to.id, variantVersion: to.version, rx: prescribe(to, cur.slot.role, phase), note: undefined, selectionId: selId };
  const result: GeneratedSession = {
    ...mapItems(session, (i) => (i.itemId === cur.itemId ? item : i)),
    selections: { ...session.selections, [selId]: note(session, selId, "user_choice", "Zmienione przez Ciebie.", to.id, slot, cur.itemId) },
  };
  if (requiresAck) result.requiredFns = session.requiredFns.map((f) => (f === cur.slot.fn ? slot.fn : f));
  const issues = validateSession(result, ctx);
  const blocking = issues.find((x) => x.severity === "block");
  return { ...base, ok: !blocking, scope, requiresAck, warnings, issues, reasons: blocking ? [{ code: blocking.code, messagePl: blocking.messagePl }] : [], result };
}

export type ApplyResult = { ok: true; session: GeneratedSession; prefsDelta: Array<{ variantId: string; mode: "avoid" | "prefer" }> } | { ok: false; code: "stale" | "invalid" | "needs_ack"; messagePl: string };

/** Zastosowanie: sprawdza bieżącą wersję planu i ponownie ocenia zmianę tym samym walidatorem. `remember` zapisuje preferencję (nadal podlega kwalifikacji). */
export function applyExerciseChange(preview: ChangePreview, current: GeneratedSession, ctx: AthleteContext, opts: { ack?: boolean; remember?: boolean } = {}): ApplyResult {
  if (preview.basePlanVersion !== current.version) return { ok: false, code: "stale", messagePl: "Plan zmienił się w międzyczasie. Zobacz podgląd jeszcze raz." };
  if (preview.requiresAck && !opts.ack) return { ok: false, code: "needs_ack", messagePl: "Ta zmiana zmienia cel tego miejsca w sesji. Potwierdź, że tego chcesz." };
  const again = previewExerciseChange(current, preview.op, ctx);
  if (!again.ok || !again.result) return { ok: false, code: "invalid", messagePl: again.reasons[0]?.messagePl ?? "Tej zmiany nie można zastosować." };
  const prefsDelta: Array<{ variantId: string; mode: "avoid" | "prefer" }> = [];
  if (opts.remember && (preview.op.kind === "swap" || preview.op.kind === "changeVariant")) {
    const cur = find(current, preview.op.itemId);
    if (cur) prefsDelta.push({ variantId: cur.variantId, mode: "avoid" }, { variantId: preview.op.toVariantId, mode: "prefer" });
  }
  return { ok: true, session: { ...again.result, version: current.version + 1 }, prefsDelta };
}

/** Zamienniki dla pozycji: zatwierdzone relacje z wynikiem kwalifikacji (do listy w widoku). */
export function swapCandidates(session: GeneratedSession, itemId: string, ctx: AthleteContext) {
  const cur = find(session, itemId);
  if (!cur) return [];
  const inSession = new Set(allItems(session).map((i) => i.variantId));
  return swapsFrom(cur.variantId).filter((r) => VARIANTS[r.to] && !inSession.has(r.to)).map((r) => ({ relation: r, variant: VARIANTS[r.to]!, q: qualify(VARIANTS[r.to]!, ctx) }));
}
