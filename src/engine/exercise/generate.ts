import { LADDERS } from "../bodyweight";
import type { Block, Item, SessionTemplate } from "../library";
import { qualify, type Qualification } from "./qualify";
import { POLICY_VERSION, formatRx, prescribe, rxFromItem } from "./rx";
import { SWAPS, swapsFrom } from "./swaps";
import { VARIANTS } from "./variants";
import type { AthleteContext, ExerciseVariant, GeneratedSession, Omitted, RxPhase, PlannedBlock, PlannedItem, Selection, Slot } from "./types";

export type Pool = Record<string, ExerciseVariant>;

/** Polityka rotacji (wersjonowana, decyzja produktu – nie wynik badań): zadania główne stabilne, rotują tylko role poniżej, co `blockWeeks` tygodni. */
export const ROTATION_POLICY = { version: 1, blockWeeks: 5, rotatingRoles: ["accessory", "preparation"] as const };

const LADDER_FN: Record<keyof typeof LADDERS, string> = { squat: "squat_main", hinge: "posterior_chain", push: "push_main", pull: "pull_row", jump: "jump_prep" };
/** Funkcja slotu inna niż pierwsza funkcja wariantu (ten sam ruch pełni w tym szablonie inną rolę). */
const FN_OVERRIDE: Record<string, string> = { "sprint-b:pogo-jumps": "plyo_ankle" };

export function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export function slotFor(template: SessionTemplate, bi: number, ii: number, item: Item, pool: Pool = VARIANTS): Slot | null {
  const v = pool[item.exerciseId];
  if (!v) return null;
  const id = `${template.id}/b${bi}i${ii}`;
  const bodyweight = template.id.startsWith("strength-bodyweight");
  const ladderKey = bodyweight ? (Object.keys(LADDERS) as Array<keyof typeof LADDERS>).find((k) => (LADDERS[k] as readonly string[]).includes(item.exerciseId)) : undefined;
  if (ladderKey) {
    const rungs = LADDERS[ladderKey] as readonly string[];
    const idx = rungs.indexOf(item.exerciseId);
    return { id, fn: LADDER_FN[ladderKey], role: v.roles[0] ?? "accessory", preferred: rungs.slice(0, idx + 1).reverse(), ladder: true, blockTitle: template.blocks[bi]?.title };
  }
  const fn = FN_OVERRIDE[`${template.id}:${item.exerciseId}`] ?? v.functions[0] ?? "unknown";
  const equiv = swapsFrom(item.exerciseId).filter((s) => s.scope === "equivalent_for_slot" && s.slotFn === fn).map((s) => s.to);
  return { id, fn, role: v.roles[0] ?? "accessory", preferred: [item.exerciseId, ...equiv], blockTitle: template.blocks[bi]?.title };
}

export interface Eligibility { eligible: ExerciseVariant[]; rejected: Array<{ variantId: string; code: string; messagePl: string; q: Extract<Qualification, { ok: false }> }> }

/** Kandydaci dla slotu: preferencje slotu, potem reszta puli o tej samej funkcji; każdy przechodzi wspólną kwalifikację. */
export function getEligibleExercises(ctx: AthleteContext, slot: Slot, pool: Pool = VARIANTS): Eligibility {
  const ids = [...new Set([...slot.preferred, ...Object.keys(pool).filter((id) => pool[id]!.functions.includes(slot.fn)).sort()])];
  const out: Eligibility = { eligible: [], rejected: [] };
  for (const id of ids) {
    const v = pool[id];
    if (!v) continue;
    const q = qualify(v, ctx);
    if (q.ok) out.eligible.push(v);
    else out.rejected.push({ variantId: id, code: q.code, messagePl: q.messagePl, q });
  }
  return out;
}

const phaseOf = (t: SessionTemplate, deload: boolean): RxPhase => (deload ? "deload" : t.phase === "intensity" ? "intensity" : "volume");
const rotationIndex = (ctx: AthleteContext) => Math.floor((Math.max(1, ctx.weekInCycle) - 1) / ROTATION_POLICY.blockWeeks);

/** Wybór wariantu: ciągłość (kolejność preferencji), rotacja tylko ról dodatkowych, preferencje zawodnika, remisy po ziarnie. */
export function chooseVariant(ctx: AthleteContext, slot: Slot, elig: Eligibility, used: Set<string>): { v: ExerciseVariant; code: Selection["code"]; reasonPl: string } | null {
  const pool = elig.eligible.filter((v) => !used.has(v.id));
  if (!pool.length) return null;
  const rank = (v: ExerciseVariant) => { const i = slot.preferred.indexOf(v.id); return i === -1 ? 1000 : i; };
  const prefer = (v: ExerciseVariant) => (ctx.prefs[v.id]?.mode === "prefer" ? 0 : 1);
  const tie = (v: ExerciseVariant) => fnv(`${ctx.seed}|${rotationIndex(ctx)}|${slot.id}|${v.id}`);
  const rotating = !slot.ladder && (ROTATION_POLICY.rotatingRoles as readonly string[]).includes(slot.role);
  const top = pool.filter((v) => slot.preferred.includes(v.id));
  if (rotating && top.length > 1) {
    const sorted = [...top].sort((a, b) => prefer(a) - prefer(b) || tie(a) - tie(b) || a.id.localeCompare(b.id));
    const v = sorted[0]!;
    return { v, code: v.id === slot.preferred[0] ? "preferred" : "rotation", reasonPl: v.id === slot.preferred[0] ? "Podstawowy wybór dla tego miejsca w sesji." : "Rotacja uzupełnienia w bieżącym bloku (ten sam cel)." };
  }
  const sorted = [...pool].sort((a, b) => prefer(a) - prefer(b) || rank(a) - rank(b) || a.id.localeCompare(b.id));
  const v = sorted[0]!;
  const first = v.id === slot.preferred[0];
  return { v, code: first ? "preferred" : "fallback", reasonPl: first ? "Podstawowy wybór dla tego miejsca w sesji." : "Pierwszy wybór nie spełniał wymagań (sprzęt, opanowanie lub nadzór), więc wzięto najbliższy dopuszczony wariant." };
}

export function generateSession(ctx: AthleteContext, template: SessionTemplate, opts: { date: string; deload: boolean }, pool: Pool = VARIANTS): GeneratedSession {
  const phase = phaseOf(template, opts.deload);
  const used = new Set<string>();
  const selections: Record<string, Selection> = {};
  const omitted: Omitted[] = [];
  const blocks: PlannedBlock[] = [];
  const requiredFns = new Set<string>();
  template.blocks.forEach((b, bi) => {
    const items: PlannedItem[] = [];
    b.items.forEach((item, ii) => {
      const slot = slotFor(template, bi, ii, item, pool);
      if (!slot) return;
      const itemId = `${opts.date}:${slot.id}`;
      if (slot.role === "main_stimulus") requiredFns.add(slot.fn);
      const elig = getEligibleExercises(ctx, slot, pool);
      const pick = chooseVariant(ctx, slot, elig, used);
      if (!pick) {
        const first = elig.rejected.find((r) => r.variantId === slot.preferred[0]) ?? elig.rejected[0];
        omitted.push({ itemId, slot, plannedVariantId: item.exerciseId, code: first?.code ?? "no_candidate", messagePl: first?.messagePl ?? "Brak ćwiczenia spełniającego wymagania.", unlock: first?.q.unlock });
        return;
      }
      if (ctx.prefs[pick.v.id]?.mode === "skip_next") {
        omitted.push({ itemId, slot, plannedVariantId: pick.v.id, code: "skip_next", messagePl: "Pominięte na Twoją prośbę po poprzedniej sesji." });
        return;
      }
      used.add(pick.v.id);
      const same = pick.v.id === item.exerciseId;
      const rx = same ? rxFromItem(item, pick.v) : prescribe(pick.v, slot.role, phase);
      const selId = `sel:${itemId}`;
      selections[selId] = { id: selId, itemId, slotId: slot.id, variantId: pick.v.id, code: pick.code, reasonPl: pick.reasonPl, rejected: elig.rejected.map((r) => ({ variantId: r.variantId, code: r.code })), policyVersion: POLICY_VERSION, seed: ctx.seed };
      items.push({ itemId, slot, variantId: pick.v.id, variantVersion: pick.v.version, rx, ...(same && item.note ? { note: item.note } : {}), selectionId: selId });
    });
    if (items.length) blocks.push({ title: b.title, items });
  });
  const notes: string[] = [];
  if (omitted.length) notes.push(`Pominięto ${omitted.length} ${omitted.length === 1 ? "ćwiczenie" : "ćwiczeń"}, bo nie spełniają wymagań. Możesz skrócić sesję, zmienić blok albo uzupełnić dane o sprzęcie i opanowanych ruchach.`);
  return { id: `${opts.date}:${template.id}`, date: opts.date, templateId: template.id, module: template.module, version: 1, blocks, omitted, selections, notes, requiredFns: [...requiredFns] };
}

export function explainSelection(session: GeneratedSession, selectionId: string): string {
  const s = session.selections[selectionId];
  if (!s) return "Brak zapisu wyboru.";
  const v = VARIANTS[s.variantId];
  const rej = s.rejected.length ? ` Odrzucone w tym miejscu: ${s.rejected.length}.` : "";
  return `${v?.namePl ?? s.variantId}: ${s.reasonPl}${rej}`;
}

/** Pozycje sesji w formie używanej przez obecny widok (Block/Item). */
export function toBlocks(session: GeneratedSession): Block[] {
  return session.blocks.map((b) => ({
    title: b.title,
    items: b.items.map((i): Item => ({
      id: i.itemId, exerciseId: i.variantId, sets: i.rx.sets, reps: formatRx(i.rx),
      ...(i.note ? { note: i.note } : {}),
      ...(i.rx.type === "strength" && i.rx.load.pctRM ? { pctRM: i.rx.load.pctRM } : {}),
    })),
  }));
}

export const allItems = (s: GeneratedSession): PlannedItem[] => s.blocks.flatMap((b) => b.items);

/** Funkcje, które sesja faktycznie pokrywa zadaniami głównymi. */
export function coveredFns(s: GeneratedSession): Set<string> {
  return new Set(allItems(s).filter((i) => i.slot.role === "main_stimulus").map((i) => i.slot.fn));
}
export { SWAPS };
