import { formatPace } from "./mas";
import { intervalTimeline, phaseAt, type RunPhase } from "./track";
import type { RunSession } from "./run";

/** Faza biegu z numerem bloku (do tempa docelowego właściwego dla bieżącego bloku). */
export interface BlockPhase extends RunPhase { block: number }

export function buildPhases(session: RunSession): BlockPhase[] {
  if (session.isTest) return [{ kind: "work", seconds: 300, label: "Test MAS – 5 minut", block: 0 }];
  return session.blocks.flatMap((b, i) => (b.reps > 1 ? intervalTimeline(b) : [{ kind: "work" as const, seconds: b.workS, label: b.label }]).map((p) => ({ ...p, block: i })));
}

/** „90 s” albo „3 min” / „2:30 min” – krótki zapis czasu trwania w komunikatach. */
export function durationText(s: number): string {
  const r = Math.round(s);
  if (r < 120) return `${r} s`;
  return r % 60 === 0 ? `${r / 60} min` : `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")} min`;
}

/** Zakres tempa docelowego (±3%) z tekstu „4:17/km”; null, gdy tekstu nie da się odczytać. */
export function paceTargetRange(paceText: string): string | null {
  const m = /(\d+):(\d{2})/.exec(paceText);
  if (!m) return null;
  const sec = Number(m[1]) * 60 + Number(m[2]);
  const f = (v: number) => formatPace(v).replace("/km", "");
  return `${f(sec * 0.97)}–${f(sec * 1.03)} /km`;
}

export type ScreenKind = "continuous" | "work" | "rest" | "complete";
export interface RunScreen {
  kind: ScreenKind;
  /** Pozostały czas bieżącej fazy (s) i jej długość. */
  left: number; total: number;
  /** Numer odcinka pracy i liczba odcinków pracy (nie liczymy przerw). */
  workNo: number; workTotal: number;
  blockIndex: number;
  next: string | null;
}

/** Co pokazać na ekranie po `elapsedS` sekundach aktywnego biegu. */
export function runScreen(phases: BlockPhase[], elapsedS: number): RunScreen {
  const workTotal = phases.filter((p) => p.kind === "work").length;
  const at = phaseAt(phases, elapsedS);
  const interval = phases.length > 1;
  if (!at) return { kind: "complete", left: 0, total: phases.at(-1)?.seconds ?? 0, workNo: workTotal, workTotal, blockIndex: phases.at(-1)?.block ?? 0, next: null };
  const ph = phases[at.index]!;
  const workNo = phases.slice(0, at.index + 1).filter((p) => p.kind === "work").length;
  const nx = phases[at.index + 1];
  let next: string | null = null;
  if (interval) {
    if (!nx) next = "ostatnia faza – potem koniec planu";
    else if (nx.kind === "rest") next = `${durationText(nx.seconds)} truchtu`;
    else next = `odcinek ${workNo + 1} z ${workTotal} · ${durationText(nx.seconds)}`;
  }
  return { kind: !interval ? "continuous" : ph.kind === "rest" ? "rest" : "work", left: at.left, total: ph.seconds, workNo, workTotal, blockIndex: ph.block, next };
}
