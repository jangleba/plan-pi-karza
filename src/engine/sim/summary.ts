import type { OutcomeKind, SimEvent, World } from "./types";

export type Tone = "good" | "bad" | "neutral";

/** Krótki nagłówek wyniku akcji (jedno zdanie, bez ozdobników). */
export function headline(kind: OutcomeKind): { title: string; tone: Tone } {
  switch (kind) {
    case "goal_for": return { title: "Gol!", tone: "good" };
    case "saved_for": return { title: "Strzał obroniony", tone: "neutral" };
    case "miss_for": return { title: "Strzał niecelny", tone: "neutral" };
    case "regain": return { title: "Piłka odzyskana", tone: "good" };
    case "goal_against": return { title: "Strata i gol po kontrze", tone: "bad" };
    case "saved_against": return { title: "Strata i kontra – obroniona", tone: "bad" };
    case "miss_against": return { title: "Strata i kontra – niecelna", tone: "bad" };
    case "timeout": return { title: "Czas minął", tone: "neutral" };
  }
}

/** Co się stało na końcu akcji (jedno zdanie, bez oceny). */
export function outcomeText(kind: OutcomeKind): string {
  switch (kind) {
    case "goal_for": return "Zdobyliśmy gola.";
    case "saved_for": return "Nasz strzał obroniony.";
    case "miss_for": return "Nasz strzał niecelny.";
    case "regain": return "Piłka wróciła do nas.";
    case "goal_against": return "Rywal strzelił gola z kontry.";
    case "saved_against": return "Strzał rywala obroniony.";
    case "miss_against": return "Rywal strzelił niecelnie.";
    case "timeout": return "Akcja trwała do końca czasu bez strzału i bez straty.";
  }
}

const sec = (t: number) => `${t.toFixed(1).replace(".", ",")} s`;

/** Najważniejsze momenty akcji w kolejności (maks. 5 linii), po polsku, rzeczowo. */
export function keyMoments(w: World): string[] {
  const nm = (id?: string) => (id === "P" ? "Ty" : (w.agents.find((a) => a.id === id)?.name ?? "?"));
  const team = (id?: string) => w.agents.find((a) => a.id === id)?.team;
  const out: string[] = [];
  const add = (e: SimEvent, text: string) => { if (out.length < 5) out.push(`${sec(e.t)} – ${text}`); };
  for (const e of w.events) {
    switch (e.type) {
      case "pass": if (team(e.by) === "us") add(e, e.by === "P" ? `Podanie do: ${nm(e.to)}` : `${nm(e.by)} podaje do: ${nm(e.to)}`); break;
      case "intercept": add(e, `${nm(e.by)} przecina podanie`); break;
      case "tackle": add(e, team(e.by) === "them" ? `${nm(e.by)} odbiera piłkę (${nm(e.to)})` : `${nm(e.by)} odbiera piłkę rywalowi`); break;
      case "counter": add(e, "Kontratak rywala"); break;
      case "dribble": add(e, e.info?.won ? `${nm(e.by)} mija: ${nm(e.to)}` : `${nm(e.by)} przegrywa drybling z: ${nm(e.to)}`); break;
      case "shot": add(e, team(e.by) === "us" ? `Strzał: ${nm(e.by)}` : `Strzał rywala: ${nm(e.by)}`); break;
      default: break;
    }
  }
  return out;
}
