import { VARIANTS, type Variant } from "./scenario";
import { cloneWorld } from "./replay";
import type { SimEvent, World } from "./types";
import { distToSegment } from "../iq";
import { agent, pass, setUser, step } from "./world";

/** Jak zakończyło się wyjście spod pressingu – bez punktów, trzy kategorie. */
export type AttemptClass = "clean" | "recovered" | "conceded";
export const CLASS_LABEL: Record<AttemptClass, string> = { clean: "Wyjście udane", recovered: "Strata odzyskana", conceded: "Strata i kontra" };

export type FirstAction =
  | { kind: "pass"; target: string; t: number }
  | { kind: "shot"; t: number }
  | { kind: "lost"; t: number; by: string };

const isFoe = (events: SimEvent[], w: World, id?: string) => !!id && w.agents.find((a) => a.id === id)?.team === "them";

/** Pierwsza decyzja użytkownika: podanie/strzał albo strata piłki przed zagraniem. */
export function firstAction(w: World): FirstAction | null {
  for (const e of w.events) {
    if (e.type === "pass" && e.by === "P" && e.to) return { kind: "pass", target: e.to, t: e.t };
    if (e.type === "shot" && e.by === "P") return { kind: "shot", t: e.t };
    if ((e.type === "tackle" || e.type === "intercept") && e.to === "P" && e.by) return { kind: "lost", t: e.t, by: e.by };
  }
  return null;
}

/** Moment i sprawca pierwszej straty piłki na rzecz rywala. */
export function firstLoss(w: World): { t: number; by: string } | null {
  const e = w.events.find((x) => x.type === "turnover" && isFoe(w.events, w, x.by));
  return e?.by ? { t: e.t, by: e.by } : null;
}

export function classify(w: World): AttemptClass {
  if (!firstLoss(w)) return "clean";
  return w.outcome?.kind === "regain" ? "recovered" : "conceded";
}

/* ------------------------------ ocena opcji „co by było” ------------------------------ */

export interface OptionResult {
  id: string;
  name: string;
  /** Piłka została u nas przez cały horyzont. */
  kept: boolean;
  /** Kiedy (s świata) i kto odebrał piłkę – gdy nie została. */
  lostAt: number | null;
  lostBy: string | null;
  /** O ile metrów do przodu jest piłka na końcu (gdy kept). */
  gain: number;
  /** Zawodnik z piłką stracił ją, zanim zdążył podać (zwłoka). */
  beforePass: boolean;
}

export const KICK_WAIT = 0.4; // s od decyzji do kontaktu z piłką
export const HORIZON = 6; // s oceny po podaniu

/**
 * Dla migawki świata sprawdza, co by się stało, gdyby użytkownik (stojąc w miejscu) podał do każdego z kolegów:
 * czy piłka zostaje u nas przez `HORIZON` s. To uproszczenie – nie uwzględnia ruchu użytkownika po podaniu.
 */
export function rateOptions(snap: World, horizon = HORIZON): OptionResult[] {
  const out: OptionResult[] = [];
  const mates = snap.agents.filter((a) => a.team === "us" && a.id !== "P" && a.role !== "GK");
  for (const m of mates) {
    const w = cloneWorld(snap);
    w.outcome = null; w.events = [];
    const t0 = w.t, P = agent(w, "P");
    w.limit = t0 + KICK_WAIT + horizon + 2;
    const startX = w.ball.pos.x;
    let passed = false, beforePass = false;
    const end = t0 + KICK_WAIT + horizon;
    while (w.t < end && !w.outcome) {
      setUser(w, P.pos, P.heading, 0);
      if (!passed && w.t >= t0 + KICK_WAIT - 1e-9) { passed = true; if (!pass(w, "P", m.id)) beforePass = true; }
      step(w, 1 / 30);
      if (beforePass) break;
    }
    const loss = firstLoss(w);
    const lost = beforePass ? { t: w.t, by: w.events.find((e) => e.type === "turnover")?.by ?? "" } : loss;
    out.push({
      id: m.id, name: m.name, kept: !lost, lostAt: lost ? lost.t : null, lostBy: lost ? lost.by : null,
      gain: lost ? 0 : Math.round(w.ball.pos.x - startX), beforePass,
    });
  }
  // najpierw te, które zostają u nas (im dalej do przodu, tym lepiej), potem przecięte (im później, tym lepiej)
  return out.sort((a, b) => Number(b.kept) - Number(a.kept) || (a.kept ? b.gain - a.gain : (b.lostAt ?? 0) - (a.lostAt ?? 0)));
}

/* ------------------------------ „Co robić” w 3 krokach ------------------------------ */

export interface CoachStep { title: string; text: string }

const sec = (t: number) => `${t.toFixed(1).replace(".", ",")} s`;
const list = (xs: string[]) => (xs.length ? xs.join(", ") : "brak");

/**
 * Trzy krótkie kroki: czytaj pressing → Twój wybór na tle tego, co by zadziałało → co robić po zagraniu/stracie.
 * Zasady ogólne (nie dane meczowe): preferuj wolnego kolegę, po podaniu nie stój, po stracie nie wślizg (docs/ZRODLA-IQ.md).
 */
export function coachSteps(input: { variant: Variant; rated: OptionResult[]; first: FirstAction | null; cls: AttemptClass; nameOf: (id: string) => string; loss: { t: number; by: string } | null }): CoachStep[] {
  const { rated, first, cls, nameOf, loss } = input;
  const free = rated.filter((r) => r.kept), closed = rated.filter((r) => !r.kept);
  const best: OptionResult | null = free[0] ?? null;

  const s1: CoachStep = {
    title: "Czytaj pressing",
    text: `${VARIANTS[input.variant]!.defence} Wolni: ${list(free.map((r) => r.name))}. Przecięte: ${list(closed.map((r) => r.name))}.`,
  };

  let t2: string;
  if (first?.kind === "pass") {
    const r = rated.find((x) => x.id === first.target);
    const name = r?.name ?? nameOf(first.target);
    if (r?.kept) t2 = best && best.id === r.id ? `${name}: najlepsza opcja w tym ustawieniu (piłka +${r.gain} m).` : `${name}: piłka została u nas. Najdalej do przodu: ${best?.name ?? name} (+${best?.gain ?? 0} m).`;
    else t2 = `${name}: ${r?.beforePass ? "za późno – piłkę straciłeś przed podaniem" : `przecięte po ${sec(r?.lostAt ?? 0)}${r?.lostBy ? ` (${nameOf(r.lostBy)})` : ""}`}. ${best ? `Lepiej: ${best.name}.` : "Każde podanie było ryzykowne – zagraj najbezpieczniej lub wyjdź z piłką z dala od presji."}`;
  } else if (first?.kind === "lost") {
    t2 = `Piłkę straciłeś po ${sec(first.t)} – ${nameOf(first.by)} doskoczył. Zagraj szybciej${best ? `, np. do: ${best.name}` : ""}; pressing zamyka się w ok. 1,5 s.`;
  } else if (first?.kind === "shot") {
    t2 = "Strzał z własnej połowy nie ma szansy. Najpierw wyjdź z pressingu.";
  } else {
    t2 = "Nie zagrałeś. Pressing zamyka się w ok. 1,5 s – decyduj wcześniej.";
  }
  const s2: CoachStep = { title: "Twój wybór", text: t2 };

  const s3: CoachStep = cls === "clean"
    ? { title: "Po zagraniu", text: "Nie stój: ruszaj w wolną przestrzeń za pressingiem i bądź kolejną opcją (trzeci zawodnik)." }
    : { title: "Po stracie", text: `${loss ? `${nameOf(loss.by)} wygrał piłkę po ${sec(loss.t)}. ` : ""}Bez wślizgu: zagradzaj drogę do bramki i opóźniaj, aż wróci pomoc – za Tobą zostaje kontra 3 na 2.` };

  return [s1, s2, s3];
}

/* ------------------------------ rysunek lepszego rozwiązania ------------------------------ */

export interface BetterPlan {
  /** „best”: Twój wybór był najlepszy, pokazujemy gdzie ruszyć po podaniu; „better”: był lepszy wybór; „run”: żadne podanie nie było bezpieczne – wyjdź z piłką. */
  kind: "best" | "better" | "run";
  from: { x: number; y: number };
  /** Docelowy punkt strzałki (kolega albo wolne miejsce). */
  to: { x: number; y: number };
  /** Id kolegi, do którego warto było zagrać (kind „better”). */
  mate?: string;
  label: string;
}

/** Wolne miejsce przed zawodnikiem z piłką: z kilku kandydatów (5–14 m do przodu, w bok do 14 m) najdalej od rywali i z wolnym torem. */
export function freeSpace(snap: World, from: { x: number; y: number }): { x: number; y: number } {
  const foes = snap.agents.filter((a) => a.team === "them" && a.role !== "GK");
  let best = { x: from.x + 8, y: from.y }, bs = -1e9;
  for (const dx of [5, 8, 11, 14]) for (const dy of [-14, -9, -4, 0, 4, 9, 14]) {
    const c = { x: Math.min(100, from.x + dx), y: Math.max(4, Math.min(64, from.y + dy)) };
    const free = Math.min(...foes.map((f) => Math.hypot(f.pos.x - c.x, f.pos.y - c.y)));
    const lane = Math.min(...foes.map((f) => distToSegment(f.pos, from, c)));
    const s = Math.min(free, 12) * 1.5 + Math.min(lane, 8) * 2 + dx * 0.4 - Math.abs(dy) * 0.15;
    if (s > bs) { bs = s; best = c; }
  }
  return best;
}

/**
 * Co narysować na powtórce w chwili decyzji: lepsze podanie (gdy zagrałeś gorzej), miejsce ruchu po dobrym podaniu
 * albo wolne miejsce do wyjścia z piłką, gdy żadne podanie nie było bezpieczne.
 */
export function betterPlan(snap: World, rated: OptionResult[], first: FirstAction | null, nameOf: (id: string) => string): BetterPlan | null {
  const P = agent(snap, "P");
  const from = { x: P.pos.x, y: P.pos.y };
  const best = rated.find((r) => r.kept) ?? null;
  const pos = (id: string) => agent(snap, id).pos;
  if (first?.kind === "pass") {
    const chosen = rated.find((r) => r.id === first.target);
    if (chosen?.kept && (!best || best.id === chosen.id || best.gain - chosen.gain < 3)) {
      return { kind: "best", from, to: freeSpace(snap, pos(chosen.id)), label: "Po podaniu ruszaj tu: bądź kolejną opcją" };
    }
  }
  if (best) {
    return { kind: "better", from, to: { x: pos(best.id).x, y: pos(best.id).y }, mate: best.id, label: `Lepiej: do ${nameOf(best.id)} (wolny, piłka +${best.gain} m)` };
  }
  return { kind: "run", from, to: freeSpace(snap, from), label: "Żadne podanie nie było bezpieczne: wyjdź z piłką tutaj" };
}
