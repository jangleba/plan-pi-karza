import compact from "./data/research-catalog.compact.json";
import registry from "./data/source-registry.json";
import { LEGACY_TO_RESEARCH, VARIANTS } from "./variants";
import type { ExerciseVariant, ReviewStatus, SetupOption } from "./types";

/** Rekord źródłowego katalogu badawczego po rozpakowaniu `{...defaults, ...record}` (niezależne kopie). */
export interface ResearchRecord {
  id: string; nameEn: string; namePl: string; module: string; family: string; variantOf: string | null;
  primaryAdaptation: string; skillDemand: "foundation" | "practised" | "advanced"; prerequisites: string[];
  supervision: "standard" | "qualified_required"; programmingUnit: string; minimumAge: number; evidenceScope: string;
  sourceTags: string[]; reviewStatus: "research_candidate"; mediaStatus: string; autoPublish: false;
  partnerRequirement: string; roleHints: string[]; parameterRequirements: string[]; contractionTypeHint: string;
  doseCountingRequirements: string[]; setupOptions: SetupOption[];
}
interface Compact { recordCount: number; defaults: Record<string, unknown>; exercises: Array<Record<string, unknown>> }
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export function expandCatalog(c: Compact = compact as unknown as Compact): ResearchRecord[] {
  return c.exercises.map((r) => ({ ...clone(c.defaults), ...clone(r) }) as unknown as ResearchRecord);
}
export const RESEARCH: ResearchRecord[] = expandCatalog();
export const SOURCES = registry.sources;
export const SOURCE_TAGS: Record<string, string[]> = registry.catalogTagMap;

const SOURCE_IDS = new Set(registry.sources.map((s) => s.id));
/** Tag katalogu → konkretne źródła; tag będący ID źródła wskazuje to źródło, pusta lista = jawny brak przypisania. */
export function sourcesForTags(tags: string[]): string[] {
  const out = new Set<string>();
  for (const t of tags) for (const s of SOURCE_TAGS[t] ?? (SOURCE_IDS.has(t) ? [t] : [])) out.add(s);
  return [...out];
}

/** Spójność: unikalne ID, istniejące odwołania variantOf, brak cykli, wszystkie wpisy to kandydaci z autoPublish=false. */
export function validateCatalog(rows: ResearchRecord[] = RESEARCH): string[] {
  const e: string[] = [];
  const ids = new Set(rows.map((r) => r.id));
  if (ids.size !== rows.length) e.push("zduplikowane id");
  for (const r of rows) {
    if (r.variantOf && !ids.has(r.variantOf)) e.push(`${r.id}: brak ${r.variantOf}`);
    if (r.reviewStatus !== "research_candidate" || r.autoPublish !== false) e.push(`${r.id}: status`);
    for (const t of r.sourceTags) if (!(SOURCE_TAGS[t] || SOURCE_IDS.has(t))) e.push(`${r.id}: tag ${t}`);
  }
  const by = new Map(rows.map((r) => [r.id, r]));
  for (const r of rows) {
    const seen = new Set<string>();
    for (let c: ResearchRecord | undefined = r; c; c = c.variantOf ? by.get(c.variantOf) : undefined) {
      if (seen.has(c.id)) { e.push(`cykl variantOf przy ${r.id}`); break; }
      seen.add(c.id);
    }
  }
  return e;
}

/** Kandydat → wariant w stanie „kandydat”: nie wchodzi do puli produkcyjnej (brak treści, brak publikacji). */
export function candidateToVariant(r: ResearchRecord): ExerciseVariant {
  return {
    id: r.id, version: 1, canonicalId: r.variantOf ?? r.id, nameEn: r.nameEn, namePl: r.namePl, family: r.family,
    movementPatterns: [r.module], jointActions: [], primaryGoal: r.primaryAdaptation, secondaryGoals: [], functions: [],
    roles: r.roleHints as ExerciseVariant["roles"], contraction: r.contractionTypeHint as ExerciseVariant["contraction"], laterality: "not_applicable",
    minimumAge: r.minimumAge, setupOptions: clone(r.setupOptions), prerequisites: [...r.prerequisites], supervision: r.supervision,
    familiarityRequired: false, allowedPrescriptionTypes: [], contentStatus: "incomplete", reviewStatus: r.reviewStatus as ReviewStatus,
    instructionsPl: [], evidence: sourcesForTags(r.sourceTags).map((sourceId) => ({ sourceId, scope: "family_inference" as const, limitations: ["Kontekst rodziny; nie walidacja wariantu."] })),
    cns: 2, loaded: false, loadConvention: "unknown",
  };
}
export const CANDIDATES: Record<string, ExerciseVariant> = Object.fromEntries(RESEARCH.map((r) => [r.id, candidateToVariant(r)]));

export interface CatalogReport {
  active: number; candidates: number; byModule: Record<string, number>; baseRecords: number; variants: number;
  mergedDuplicates: Array<{ legacyId: string; researchId: string }>;
  legacyWithoutCandidate: string[];
  researchOnly: number;
  /** Brakujące treści kandydatów: wszystkie – po imporcie żaden nie ma instrukcji, mediów ani recept. */
  missing: { instructions: number; media: number; prescriptions: number; noSourceTags: number };
  emptySourceTags: string[];
}
export function catalogReport(): CatalogReport {
  const byModule: Record<string, number> = {};
  for (const r of RESEARCH) byModule[r.module] = (byModule[r.module] ?? 0) + 1;
  const merged = Object.entries(LEGACY_TO_RESEARCH).filter(([, r]) => r && RESEARCH.some((x) => x.id === r)).map(([legacyId, r]) => ({ legacyId, researchId: r! }));
  const mergedIds = new Set(merged.map((m) => m.researchId)); // jeden kandydat = jedna pozycja produkcyjna
  return {
    active: Object.keys(VARIANTS).length, candidates: RESEARCH.length, byModule,
    baseRecords: RESEARCH.filter((r) => !r.variantOf).length, variants: RESEARCH.filter((r) => r.variantOf).length,
    mergedDuplicates: merged,
    legacyWithoutCandidate: Object.entries(LEGACY_TO_RESEARCH).filter(([, r]) => !r).map(([id]) => id),
    researchOnly: RESEARCH.length - mergedIds.size,
    missing: { instructions: RESEARCH.length, media: RESEARCH.length, prescriptions: RESEARCH.length, noSourceTags: RESEARCH.filter((r) => r.sourceTags.length === 0).length },
    emptySourceTags: RESEARCH.filter((r) => r.sourceTags.length === 0).map((r) => r.id),
  };
}
