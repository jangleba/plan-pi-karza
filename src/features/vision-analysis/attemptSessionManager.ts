/**
 * AttemptSessionManager — zarządza próbami/seriami zgodnie z protokołem testu.
 *
 * Reguły (patrz testProtocols.ts):
 *  1. Testy maksymalne: 2 prawidłowe próby, wynik = najlepszy; 3. próba WYŁĄCZNIE
 *     jako zastępstwo próby nieważnej.
 *  2. Testy bilateralne: 2 prawidłowe próby na każdą stronę, najlepszy wynik
 *     każdej strony + asymetria.
 *  3. Testy serii: jedna pełna prawidłowa seria; kolejna tylko po unieważnieniu.
 *
 * Menedżer nie liczy metryk — przyjmuje gotowy wynik jednej próby (jeden film).
 */

import type { TestType } from "./types";
import { getTestProtocol, type TestProtocol } from "./testProtocols";

export type Side = "left" | "right" | "none";

export interface AttemptRecord {
  id: string;
  side: Side;
  valid: boolean;
  /** Wartość porównywalna do wyboru najlepszego wyniku (np. wysokość/prędkość). */
  value: number | null;
  /** Czy wyższa wartość jest lepsza (skok) czy niższa (czas). */
  higherIsBetter: boolean;
  analysisId: string;
}

export interface SideResult {
  side: Side;
  validCount: number;
  best: AttemptRecord | null;
}

export interface SessionState {
  testType: TestType;
  protocol: TestProtocol;
  attempts: AttemptRecord[];
  perSide: Record<Side, SideResult>;
  /** Czy zebrano komplet prawidłowych prób wymaganych protokołem. */
  complete: boolean;
  /** Czy można nagrać kolejną próbę (limit / zastępstwo za nieważną). */
  canRecordMore: boolean;
  /** Wynik końcowy (best lub best_per_side). */
  finalValue: number | null;
  finalPerSide: { left: number | null; right: number | null } | null;
  /** Asymetria L/R w % (tylko bilateralne). */
  asymmetryPct: number | null;
}

function emptySide(side: Side): SideResult {
  return { side, validCount: 0, best: null };
}

function pickBest(a: AttemptRecord | null, b: AttemptRecord): AttemptRecord {
  if (!a || a.value == null) return b;
  if (b.value == null) return a;
  if (b.higherIsBetter) return b.value > a.value ? b : a;
  return b.value < a.value ? b : a;
}

export class AttemptSessionManager {
  private readonly protocol: TestProtocol;
  private readonly attempts: AttemptRecord[] = [];

  constructor(private readonly testType: TestType) {
    this.protocol = getTestProtocol(testType);
  }

  addAttempt(record: AttemptRecord): SessionState {
    this.attempts.push(record);
    return this.state();
  }

  private sidesInScope(): Side[] {
    return this.protocol.attemptProtocol.bilateral ? ["left", "right"] : ["none"];
  }

  state(): SessionState {
    const perSide: Record<Side, SideResult> = {
      left: emptySide("left"),
      right: emptySide("right"),
      none: emptySide("none"),
    };

    for (const a of this.attempts) {
      if (!a.valid) continue;
      const s = perSide[a.side] ?? perSide.none;
      s.validCount += 1;
      s.best = pickBest(s.best, a);
    }

    const scope = this.sidesInScope();
    const required = this.protocol.attemptProtocol.requiredValidAttempts;
    const complete = scope.every((s) => perSide[s].validCount >= required);

    // Limit: maxAttempts per strona; 3. próba dopuszczalna tylko gdy istnieje
    // próba nieważna do zastąpienia (replacementOnInvalidOnly).
    const canRecordMore = scope.some((s) => {
      const total = this.attempts.filter((a) => (a.side ?? "none") === s).length;
      const valid = perSide[s].validCount;
      if (valid >= required) return false;
      if (total >= this.protocol.attemptProtocol.maxAttempts) return false;
      return true;
    });

    let finalValue: number | null = null;
    let finalPerSide: { left: number | null; right: number | null } | null = null;
    let asymmetryPct: number | null = null;

    if (this.protocol.attemptProtocol.bilateral) {
      const l = perSide.left.best?.value ?? null;
      const r = perSide.right.best?.value ?? null;
      finalPerSide = { left: l, right: r };
      if (l != null && r != null) {
        const hi = Math.max(l, r);
        const lo = Math.min(l, r);
        asymmetryPct = hi > 0 ? Number((((hi - lo) / hi) * 100).toFixed(1)) : 0;
      }
    } else {
      finalValue = perSide.none.best?.value ?? null;
    }

    return {
      testType: this.testType,
      protocol: this.protocol,
      attempts: [...this.attempts],
      perSide,
      complete,
      canRecordMore,
      finalValue,
      finalPerSide,
      asymmetryPct,
    };
  }
}

export function createAttemptSession(testType: TestType): AttemptSessionManager {
  return new AttemptSessionManager(testType);
}
