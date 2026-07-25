// Losowe bodźce do trybu boiskowego.
// Bodziec NIGDY nie podaje gotowej odpowiedzi — opisuje sytuację lub warunek,
// a decyzję podejmuje zawodnik.

export type StimulusKind =
  | "pressure"
  | "space"
  | "direction"
  | "touches"
  | "gate"
  | "foot";

export type Stimulus =
  | { kind: "pressure"; side: "L" | "P" }
  | { kind: "space"; side: "L" | "P" }
  | { kind: "direction"; arrow: "←" | "→" | "↑" | "↓" }
  | { kind: "touches"; count: 1 | 2 | 3 }
  | { kind: "gate"; number: 1 | 2 | 3 | 4 }
  | { kind: "foot"; side: "L" | "P" };

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const ALL: (() => Stimulus)[] = [
  () => ({ kind: "pressure", side: pick(["L", "P"] as const) }),
  () => ({ kind: "space", side: pick(["L", "P"] as const) }),
  () => ({ kind: "direction", arrow: pick(["←", "→", "↑", "↓"] as const) }),
  () => ({ kind: "touches", count: pick([1, 2, 3] as const) }),
  () => ({ kind: "gate", number: pick([1, 2, 3, 4] as const) }),
  () => ({ kind: "foot", side: pick(["L", "P"] as const) }),
];

export function generateSequence(count: number): Stimulus[] {
  const out: Stimulus[] = [];
  let last: StimulusKind | null = null;
  for (let i = 0; i < count; i++) {
    let s: Stimulus;
    let guard = 0;
    do {
      s = ALL[Math.floor(Math.random() * ALL.length)]();
      guard++;
    } while (s.kind === last && guard < 6);
    last = s.kind;
    out.push(s);
  }
  return out;
}

export function stimulusLabel(s: Stimulus): string {
  switch (s.kind) {
    case "pressure":
      return `Presja z ${s.side === "L" ? "lewej" : "prawej"}`;
    case "space":
      return `Wolne z ${s.side === "L" ? "lewej" : "prawej"}`;
    case "direction":
      return "Kierunek";
    case "touches":
      return `${s.count} ${s.count === 1 ? "kontakt" : "kontakty"}`;
    case "gate":
      return `Bramka ${s.number}`;
    case "foot":
      return `${s.side === "L" ? "Lewa" : "Prawa"} noga`;
  }
}

export function stimulusGlyph(s: Stimulus): string {
  switch (s.kind) {
    case "pressure":
      return s.side === "L" ? "◀" : "▶";
    case "space":
      return s.side === "L" ? "◁" : "▷";
    case "direction":
      return s.arrow;
    case "touches":
      return String(s.count);
    case "gate":
      return String(s.number);
    case "foot":
      return s.side;
  }
}
