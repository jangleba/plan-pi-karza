/** What the player is told after an 11v11 fragment, and the story of what happened.
 *
 * Graded from your own actions only:
 * - Timing: was the pass released while the runner could still be played onside, and not before
 *   he had even started? Offside is read at the moment the ball left the foot.
 * - Decyzja (choice): what you did with the ball: a pass into space at the right moment, a safe
 *   pass, a shot, or keeping it too long.
 * - Rezultat: how the fragment ended.
 * Plus the moments in time order, each with the offside line and the players it concerned, so
 * the replay from above can stop at them and draw what the text says.
 */
import type { E11Event, OutcomeKind, SimState } from "./e11Sim";
import { TICK_HZ } from "./e11Sim";
import { shirtOf, SLOT_LABEL, SLOTS, PLAYERS_PER_TEAM } from "./e11Variants";

export type Grade = "good" | "ok" | "poor";
export type TimingKind = "inTime" | "early" | "late" | "none";
export type ProblemKey =
  "late" | "early" | "readLine" | "heldTooLong" | "blockedLane" | "rushedShot" | "none";

export type Moment = {
  tick: number;
  seconds: number;
  kind: "start" | "line" | "run" | "pass" | "shot" | "offside" | "end";
  grade: Grade | null;
  title: string;
  text: string;
  /** What the replay draws at this moment: the offside line and the players concerned. */
  focus: { line: number | null; players: number[]; arrow?: [number, number] };
};

export type E11Debrief = {
  outcome: OutcomeKind;
  /** Tick to start the replay from: a moment before your decision. */
  keyTick: number;
  timing: { grade: Grade; kind: TimingKind; text: string };
  choice: { grade: Grade; text: string };
  result: { text: string };
  tip: string;
  problem: ProblemKey;
  moments: Moment[];
};

export const RESULT_TEXT: Record<OutcomeKind, string> = {
  goal: "Bramka dla twojej drużyny.",
  saved: "Strzał obroniony przez bramkarza.",
  shotOff: "Strzał obok bramki.",
  offside: "Sędzia przerwał grę: spalony.",
  intercepted: "Rywale przechwycili piłkę.",
  tackled: "Rywal odebrał ci piłkę.",
  out: "Piłka wyszła poza boisko.",
  timeout: "Czas fragmentu minął.",
};

const TIPS: Record<ProblemKey, string> = {
  late: "Podaj, zanim partner znajdzie się za linią obrony. Spalony liczy się w chwili podania, nie w chwili przyjęcia, więc piłka może lecieć za linię, gdy partner dopiero tam biegnie.",
  early:
    "Poczekaj, aż partner ruszy. Piłka zagrana, gdy jeszcze stoi przy linii, doleci pierwsza do obrońców lub bramkarza.",
  readLine:
    "Zanim podasz, sprawdź linię obrony. Gdy obrońcy podchodzą, partner stojący równo z nimi nagle jest na spalonym. Poczekaj, aż się cofnie, albo zagraj do innego.",
  heldTooLong:
    "Utrzymanie piłki to nie czekanie. Rywal dochodzi do ciebie, więc zdecyduj się wcześniej: podanie w wolne miejsce albo zmiana kierunku.",
  blockedLane:
    "Podawaj tylko wtedy, gdy między tobą a partnerem nie stoi rywal. Zamknięty tor oznacza przechwyt.",
  rushedShot:
    "Strzał z daleka rzadko jest najlepszą decyzją. Przy takiej okazji lepiej zagrać do partnera z wolną drogą do bramki.",
  none: "Dobra decyzja i dobry moment. Powtórz to przy innym ustawieniu linii obrony.",
};

const sec = (tick: number) => tick / TICK_HZ;
const m1 = (n: number) => Math.abs(n).toFixed(1).replace(".", ",");
const s1 = (n: number) => n.toFixed(1).replace(".", ",");
const nameOf = (index: number) => {
  const slot = SLOTS[index % PLAYERS_PER_TEAM]!;
  return `#${shirtOf(index)} (${SLOT_LABEL[slot].toLowerCase()})`;
};

/** Window of a run, read from the recorded events: when it started and when he got ahead. */
function runWindow(events: readonly E11Event[], slotIndexOf: number) {
  let burst: number | null = null;
  let cross: number | null = null;
  for (const e of events) {
    if (e.type !== "run") continue;
    if (SLOTS.indexOf(e.slot) !== slotIndexOf) continue;
    if (e.state === "burst") burst = e.tick;
    if (e.state === "cross") cross = e.tick;
  }
  return { burst, cross };
}

export function buildDebrief(s: SimState): E11Debrief {
  const ev = s.events;
  const outcome = s.outcome?.kind ?? "timeout";
  const mine = ev.filter(
    (e): e is Extract<E11Event, { type: "pass" }> => e.type === "pass" && e.by === s.ty,
  );
  const shots = ev.filter(
    (e): e is Extract<E11Event, { type: "shot" }> => e.type === "shot" && e.by === s.ty,
  );
  const offside = ev.find((e): e is Extract<E11Event, { type: "offside" }> => e.type === "offside");
  const firstPass = mine[0] ?? null;
  const moments: Moment[] = [];
  const at = (tick: number, m: Omit<Moment, "tick" | "seconds">) =>
    moments.push({ tick, seconds: sec(tick), ...m });

  at(0, {
    kind: "start",
    grade: null,
    title: "Początek akcji",
    text: `Masz piłkę. Rywale bronią z linią obrony ${lineWords(s.variant.line)}.`,
    focus: { line: s.snapshots[0]?.line ?? null, players: [s.ty] },
  });
  for (const e of ev) {
    if (e.type === "line") {
      const up = e.to < e.from;
      at(e.tick, {
        kind: "line",
        grade: null,
        title: up ? "Obrońcy podchodzą" : "Obrońcy się cofają",
        text: up
          ? `Linia obrony podeszła o ${m1(e.to - e.from)} m do przodu: ktoś, kto stał równo z obrońcami, jest teraz na spalonym.`
          : `Linia obrony cofnęła się o ${m1(e.to - e.from)} m: za nią jest więcej miejsca.`,
        focus: { line: e.to, players: [] },
      });
    } else if (e.type === "run") {
      if (e.state !== "burst") continue;
      const index = SLOTS.indexOf(e.slot);
      at(e.tick, {
        kind: "run",
        grade: null,
        title: "Partner rusza za linię",
        text: `${nameOf(index)} rusza za plecy obrońców. Od tej chwili ma tylko kilka metrów zapasu do linii: pod spalonym podanie musi wyjść, zanim ją minie.`,
        focus: { line: lineAt(s, e.tick), players: [index] },
      });
    }
  }

  let timing: E11Debrief["timing"] = {
    grade: "ok",
    kind: "none",
    text: "Nie zagrałeś w przestrzeń za linię obrony, więc timing nie był sprawdzany.",
  };
  let choice: E11Debrief["choice"];
  let problem: ProblemKey = "none";
  const keyTick = Math.max(
    0,
    (firstPass?.tick ?? shots[0]?.tick ?? s.outcome?.tick ?? 0) - TICK_HZ * 2,
  );

  if (firstPass) {
    const receiver = firstPass.to;
    const slot = receiver % PLAYERS_PER_TEAM;
    const { burst, cross } = runWindow(ev, slot);
    const gap = firstPass.gap;
    const caught = outcome === "offside" && offside?.passer === s.ty;
    const flaggedHim = firstPass.flagged.includes(receiver);
    const stepBefore = ev.some(
      (e) =>
        e.type === "line" &&
        e.tick < firstPass.tick &&
        e.tick > firstPass.tick - TICK_HZ * 3 &&
        e.to < e.from,
    );
    if (flaggedHim && (caught || gap > 0)) {
      problem = stepBefore ? "readLine" : "late";
      timing = {
        grade: "poor",
        kind: "late",
        text: stepBefore
          ? `Za późno względem linii: obrońcy podeszli, a ${nameOf(receiver)} stał ${m1(gap)} m przed linią w chwili podania.`
          : `Za późno: w chwili podania ${nameOf(receiver)} był ${m1(gap)} m przed linią obrony. Spalony liczy się w chwili podania.`,
      };
      choice = {
        grade: "poor",
        text: `Zagrałeś do ${nameOf(receiver)}, który był na spalonym. Pomysł był dobry (piłka za linię), moment nie.`,
      };
    } else if (
      firstPass.through &&
      burst !== null &&
      firstPass.sinceBurst !== null &&
      firstPass.sinceBurst < -45
    ) {
      problem = "early";
      timing = {
        grade: "poor",
        kind: "early",
        text: `Za wcześnie: ${nameOf(receiver)} ruszył dopiero ${s1(-firstPass.sinceBurst / TICK_HZ)} s po twoim podaniu, a piłka doleciała przed nim.`,
      };
      choice = {
        grade: outcome === "intercepted" ? "poor" : "ok",
        text: `Podanie za linię było dobrym pomysłem, ale zagrane przed ruchem partnera.`,
      };
    } else if (firstPass.through) {
      const sinceBurst = firstPass.sinceBurst ?? 0;
      timing = {
        grade: "good",
        kind: "inTime",
        text: `Dobry moment: podanie wyszło ${sinceBurst >= 0 ? `${s1(sinceBurst / TICK_HZ)} s po starcie` : `${s1(-sinceBurst / TICK_HZ)} s przed startem`} partnera, gdy był ${m1(gap)} m ${gap <= 0 ? "za linią" : "przed linią"}${cross !== null ? ` (linię minął ${s1((cross - firstPass.tick) / TICK_HZ)} s później)` : ""}. Piłka wyszła z nogi, zanim stał się spalonym.`,
      };
      choice = {
        grade: outcome === "intercepted" || outcome === "tackled" ? "ok" : "good",
        text: "Podanie za linię obrony w momencie ruchu partnera to właściwa decyzja przeciwko wysokiej linii.",
      };
    } else {
      // A pass to feet.
      const closed = firstPass.lane < 1.8;
      const pressed = firstPass.pressure < 3;
      timing = {
        grade: closed ? "poor" : "good",
        kind: "none",
        text: closed
          ? `Tor podania był zamknięty: rywal stał ${m1(firstPass.lane)} m od jego linii.`
          : `Podanie do partnera z wolnym torem (${m1(firstPass.lane)} m od najbliższego rywala).`,
      };
      problem = closed ? "blockedLane" : "none";
      choice = {
        grade: closed ? "poor" : pressed ? "good" : "ok",
        text: closed
          ? "Podanie w zamknięty tor oddaje piłkę rywalom."
          : pressed
            ? "Rywal był blisko, a ty rozegrałeś piłkę szybko i bezpiecznie."
            : "Bezpieczne podanie do partnera.",
      };
    }
    at(firstPass.tick, {
      kind: "pass",
      grade: timing.grade,
      title: firstPass.through ? "Twoje podanie za linię" : "Twoje podanie",
      text: timing.text,
      focus: {
        line: firstPass.line,
        players: [s.ty, receiver, ...firstPass.flagged.filter((i) => i !== receiver)],
        arrow: [s.ty, receiver],
      },
    });
  } else if (shots[0]) {
    const shot = shots[0];
    const far = shot.distance > 25 || shot.lane < 1.2;
    problem = far ? "rushedShot" : "none";
    timing = { grade: "ok", kind: "none", text: "Strzał: timing podania nie był sprawdzany." };
    choice = {
      grade: far ? "poor" : "good",
      text: far
        ? `Strzał z ${Math.round(shot.distance)} m, z zamkniętym torem: niska szansa.`
        : `Strzał z ${Math.round(shot.distance)} m, z wolnym torem: uzasadniona decyzja.`,
    };
    at(shot.tick, {
      kind: "shot",
      grade: choice.grade,
      title: "Twój strzał",
      text: choice.text,
      focus: { line: null, players: [s.ty] },
    });
  } else if (outcome === "tackled") {
    problem = "heldTooLong";
    const held = sec((s.outcome?.tick ?? 0) - 40);
    choice = {
      grade: "poor",
      text: `Trzymałeś piłkę ${s1(held)} s bez decyzji; rywal ją odebrał.`,
    };
    timing = {
      grade: "poor",
      kind: "none",
      text: "Nie zagrałeś w odpowiednim momencie: okno minęło.",
    };
  } else {
    choice = { grade: "ok", text: "Nie podjąłeś decyzji z piłką; akcja skończyła się czasem." };
  }

  if (offside)
    at(offside.tick, {
      kind: "offside",
      grade: "poor",
      title: "Spalony",
      text: `Sędzia podniósł chorągiewkę: ${nameOf(offside.by)} był ${m1(offside.gap)} m przed linią obrony w chwili twojego podania.`,
      focus: { line: offside.line, players: [offside.by] },
    });
  at(s.outcome?.tick ?? s.tick, {
    kind: "end",
    grade: null,
    title: "Koniec akcji",
    text: RESULT_TEXT[outcome],
    focus: { line: null, players: [] },
  });
  moments.sort((a, b) => a.tick - b.tick);
  return {
    outcome,
    keyTick,
    timing,
    choice,
    result: { text: RESULT_TEXT[outcome] },
    tip: TIPS[problem],
    problem,
    moments,
  };
}

function lineWords(line: string): string {
  return line === "high"
    ? "wysoko (blisko środka boiska)"
    : line === "mid"
      ? "w połowie ich połowy"
      : "nisko, blisko własnej bramki";
}
function lineAt(s: SimState, tick: number): number | null {
  const snap = s.snapshots.find((x) => x.tick >= tick);
  return snap ? snap.line : null;
}
