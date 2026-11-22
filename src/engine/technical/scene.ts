import { nudgeCones } from "../drillLayout";
import type { Arrow, Drill, DrillActor, DrillStation, DrillTarget, Point } from "../drill";
import type { PracticeMode, PracticeSide, TechnicalFamily } from "./types";
import { MODE_LABEL } from "./types";
import { TECHNICAL_FAMILIES, TECHNICAL_SOURCES } from "./catalog";

const p = (x: number, y: number): Point => ({ x, y });
const end = (a: Arrow): Point => a.points[a.points.length - 1]!;

/** Każdy schemat ma jeden fizyczny tor piłki i jawne pozycje wszystkich wykonawców. */
export function technicalScene(f: TechnicalFamily, mode: PracticeMode, side: PracticeSide, route: 0 | 1): Drill {
  if (!f.modes.includes(mode)) throw new Error(`Unsupported mode: ${f.id}/${mode}`);
  const { width: w, height: h } = f.field;
  const arrows: Arrow[] = [], actors: DrillActor[] = [], stations: DrillStation[] = [], targets: DrillTarget[] = [];
  let me = p(w / 2, h - 3), ball = me;
  const providerId = mode === "partner" ? "server" : "bounce";
  const add = (style: Arrow["style"], pts: Point[], step: number, note: string, actorId = "me") => arrows.push({ style, points: pts, step, note, actorId });
  const target = (q: Point, label = "Cel") => targets.push({ ...q, width: 3, height: 3, label });
  const provider = (q: Point) => {
    if (mode === "partner") actors.push({ ...q, id: providerId, kind: "partner", label: "P" });
    else stations.push({ ...q, id: providerId, kind: mode === "wall" ? "wall" : "rebounder", label: MODE_LABEL[mode] });
  };
  const shoot = (q: Point, step: number) => add("shot", [q, p(w / 2 + (route ? 2.2 : -2.2), 1.7)], step, "Uderz do wybranej części bramki.");
  // Technika bez partnera: piłka rozpoczyna akcję przy zawodniku, nigdy nie pojawia się znikąd.
  if (f.id === "ball-mastery-exit") {
    me = p(9, 11); ball = me;
    add("dribble", [me, p(7, 8), p(10, 6)], 1, "Prowadź blisko stopy, zmieniając jej powierzchnię.");
    add("dribble", [p(10, 6), p(route ? 5 : 14, route ? 4 : 3)], 2, "Wyjdź przez oznaczony cel.");
    target(end(arrows[1]!));
  } else if (f.id === "v-turn-escape" || f.id === "protect-turn-gate") {
    me = p(w / 2, h - 2); ball = me;
    add("dribble", [me, p(w / 2, 5)], 1, "Podejdź z piłką do punktu odniesienia.");
    add("dribble", [p(w / 2, 5), p(w / 2 - 1, 8), p(route ? 3 : w - 3, 7)], 2, route ? "Obróć się i wyprowadź piłkę na zewnątrz." : "Cofnij piłkę i wyjdź pod kątem.");
    target(end(arrows[1]!));
  } else if (f.id === "wing-inside-finish" || f.id === "live-wide-finish") {
    me = p(34, 28); ball = me;
    add("dribble", [me, p(32, 23)], 1, "Podejdź do punktu odniesienia, zachowując kontrolę.");
    const cut = route ? p(32, 16) : p(25, 19);
    add("dribble", [p(32, 23), route ? p(35, 21) : p(29, 23), cut], 2, f.live ? "Wybierz wyjście według ruchu aktywnego obrońcy; trasa to przykład." : f.alternatives[route]);
    if (f.live) {
      actors.push({ ...p(29, 22), id: "defender", kind: "defender", label: "O" });
      add("run", [p(29, 22), route ? p(31, 22) : p(28, 21)], 1, "Obrońca podejmuje pojedynek.", "defender");
    }
    shoot(cut, 3);
  } else if (f.id === "wing-cutback" || f.id === "fb-early-cross") {
    me = p(w - 5, h - 4); ball = me;
    const cross = f.id === "fb-early-cross";
    const q = p(w - 6, cross ? 20 : 7), z = p(w / 2 + (route ? 5 : -2), route ? 10 : 14);
    add("dribble", [me, p(w - 5, h / 2), q], 1, cross ? "Przygotuj dośrodkowanie przed linią końcową." : "Prowadź szeroko w stronę linii końcowej.");
    add(cross ? "lob" : "pass", [q, z], 2, cross ? "Dośrodkuj do wyznaczonej strefy." : "Wycofaj piłkę do strefy celu.");
    target(z);
  } else if (f.id === "cb-carry-diagonal" || f.id === "gk-long") {
    me = p(w / 2 - 4, h - 3); ball = me;
    const q = p(w / 2 + 1, h - 11), z = p(w - 5, 4);
    add("dribble", [me, p(me.x, h - 8), q], 1, "Wyprowadź piłkę i przygotuj kąt podania.");
    add(route ? "lob" : "pass", [q, z], 2, f.alternatives[route]); target(z);
  } else if (f.id === "striker-diagonal" || f.id === "eight-late-finish") {
    const late = f.id === "eight-late-finish";
    me = p(w / 2 + 7, h - 4); const server = late ? p(w - 5, 10) : p(5, h - 8);
    ball = server; provider(server);
    const away = late ? p(w / 2 + 4, h - 9) : p(w / 2 + 10, h - 2);
    const recv = p(w / 2 + (route ? 7 : 3), 18), touch = p(recv.x - 2, 15);
    add("run", [me, away], 1, late ? "Zaczekaj na przygotowanie podania i rusz z głębi." : "Zrób krótki ruch od piłki.");
    add("run", [away, recv], 2, "Zmień tempo i zaatakuj podanie.");
    add("pass", [server, recv], 2, "Partner podaje w ruch zawodnika.", providerId);
    add("touch", [recv, touch], 3, "Przyjmij w kierunku bramki."); shoot(touch, 4);
  } else if (f.id === "gk-support") {
    me = p(14, 21); const server = p(4, 10), recv = p(route ? 21 : 18, 18), touch = p(recv.x + 1, 15), z = p(24, 4);
    ball = server; provider(server);
    add("run", [me, recv], 1, "Stwórz nowy kąt wsparcia.");
    add("pass", [server, recv], 2, "Partner zagrywa do nowej pozycji.", providerId);
    add("touch", [recv, touch], 3, "Otwórz ciało pierwszym kontaktem.");
    add("pass", [touch, z], 4, "Rozegraj do przeciwnego celu."); target(z);
  } else if (f.id === "live-receive-escape") {
    me = p(12, 12); const server = p(12, 3), q = p(route ? 5 : 19, 9);
    ball = server; provider(server);
    actors.push({ ...p(12, 15), id: "defender", kind: "defender", label: "O" });
    add("pass", [server, me], 1, "Podający zagrywa; obrońca rusza po podaniu.", providerId);
    add("run", [p(12, 15), p(route ? 14 : 10, 12)], 1, "Przykład ruchu aktywnego obrońcy.", "defender");
    add("touch", [me, p(route ? 9 : 15, 11)], 2, "Przyjmij w kierunku wolnej bramki.");
    add("dribble", [p(route ? 9 : 15, 11), q], 3, "Wyjdź do wolnej bramki; reaguj na obrońcę."); target(q);
  } else {
    // Wymiana z fizycznym podającym lub powierzchnią odbijającą, następnie działanie pozycyjne.
    const combo = ["wing-wall-finish", "striker-layoff-spin", "fb-overlap-cutback"].includes(f.id);
    const back = f.id === "striker-back-goal";
    const finishing = f.goal;
    me = combo ? p(w - 6, h - 3) : back ? p(w / 2, h - 6) : p(w / 2, h - 4);
    const bounce = combo ? p(w - 13, h - 10) : back ? p(w / 2, h - 2) : finishing ? p(w / 2 + 8, 9) : p(w / 2, 2);
    const recv = combo ? p(w - (route ? 4 : 6), h - 11) : me;
    ball = me; provider(bounce);
    add("pass", [me, bounce], 1, mode === "partner" ? "Zagraj do partnera." : `Zagraj w ${mode === "wall" ? "ścianę" : "rebounder"}.`);
    const via = p(me.x, h - 7.3);
    if (combo) add("run", [me, p(me.x + 1, h - 5), via], 1, "Rusz od razu po zagraniu, zanim piłka odbije się od podającego.");
    add("pass", [bounce, recv], 2, combo ? "Podanie zwrotne do miejsca przyjęcia." : "Piłka wraca do przyjęcia.", providerId);
    if (combo) add("run", [via, recv], 2, "Dokończ ruch do przyjęcia w czasie powrotu podania.");
    if (f.id === "first-time-wall") {
      add("pass", [recv, bounce], 3, route ? "Odegraj drugą nogą bez przyjęcia." : "Odegraj z pierwszej piłki do celu.");
    } else {
      const touch = combo ? p(recv.x - 3, recv.y - 2) : p(me.x + (route ? -3 : 3), me.y - 2);
      add("touch", [recv, touch], 3, back ? "Przyjmij z obrotem w stronę bramki." : "Pierwszy kontakt skieruj do kolejnej akcji.");
      if (finishing) {
        const q = combo ? p(w / 2 + (route ? 7 : 4), 17) : p(touch.x, 13);
        add("dribble", [touch, q], 4, "Przygotuj miejsce do uderzenia."); shoot(q, 5);
      } else if (f.id === "fb-overlap-cutback") {
        const q = p(w - 4, 6), z = p(w / 2 + (route ? 4 : -2), 14);
        add("dribble", [touch, p(w - 3, 15), q], 4, "Przyspiesz z piłką w szerokim korytarzu.");
        add("pass", [q, z], 5, "Wycofaj podanie do strefy."); target(z);
      } else if (f.id === "six-halfturn") {
        const q = p(route ? 4 : w - 4, 6);
        add("dribble", [touch, q], 4, "Wyjdź przez wybraną bramkę."); target(q);
      } else {
        let q = touch, step = 4;
        if (f.id === "eight-drive-release") {
          q = p(route ? w - 8 : w / 2, h / 2 - 1);
          add("dribble", [touch, q], step++, "Wyprowadź piłkę do przodu.");
        }
        const z = p(route ? 4 : w - 4, 4);
        add("pass", [q, z], step, "Zagraj przez bramkę do oznaczonego celu."); target(z);
      }
    }
  }
  if (f.goal) {
    const q = arrows.find((a) => a.style === "shot")!.points.at(-1)!;
    targets.push({ ...q, width: 2, height: 1, label: "Cel strzału" });
  }
  for (const a of arrows) if (a.style === "lob" && a.points.length === 2) {
    const [from, to] = a.points as [Point, Point], dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy);
    a.points = Array.from({ length: 17 }, (_, i) => { const t = i / 16, bow = Math.sin(t * Math.PI) * Math.min(2, len / 10); return p(from.x + dx * t - dy / len * bow, from.y + dy * t + dx / len * bow); });
  }
  actors.unshift({ ...me, id: "me", kind: "player", label: "1" });
  const mirror = <T extends Point>(q: T): T => side === "left" ? { ...q, x: w - q.x } : { ...q };
  // Orientacja powierzchni odbijającej według kierunku zagrania i oczekiwanego odbicia.
  for (const s of stations) {
    const incoming = arrows.find((a) => a.actorId === "me" && a.style === "pass" && Math.hypot(end(a).x - s.x, end(a).y - s.y) < 0.01);
    const outgoing = arrows.find((a) => a.actorId === s.id);
    if (incoming && outgoing) {
      const a = incoming.points[0]!, b = end(outgoing), da = Math.hypot(a.x - s.x, a.y - s.y), db = Math.hypot(b.x - s.x, b.y - s.y);
      const nx = (a.x - s.x) / da + (b.x - s.x) / db, ny = (a.y - s.y) / da + (b.y - s.y) / db;
      s.angle = Math.atan2(ny, side === "left" ? -nx : nx) * 180 / Math.PI + 90;
    }
  }
  const cones = Array.from({ length: f.cones }, (_, i) => ({ ...mirror(p(Math.max(1, Math.min(w - 1, me.x - 2 - i)), Math.min(h - 1, me.y + 1))), color: (i % 2 ? "blue" : "yellow") as "blue" | "yellow" }));
  // Stożki wyznaczają cel, a pozostałe oznaczają start / punkt zmiany kierunku.
  if (targets[0] && cones.length >= 2) {
    const z = targets[0];
    cones[0] = { ...mirror(p(z.x - z.width / 2, z.y)), color: "yellow" };
    cones[1] = { ...mirror(p(z.x + z.width / 2, z.y)), color: "blue" };
  }
  if (!targets.length && cones.length) {
    const turn = arrows.find((a) => a.style === "dribble" && a.step !== 1)?.points[0] ?? p(me.x - 2, me.y - 4);
    cones[0] = { ...mirror(p(Math.min(w - 1, turn.x + 1), turn.y)), color: "yellow" };
  }
  if (cones.length > 3) {
    const q = arrows.find((a) => a.style === "touch")?.points.at(-1) ?? arrows.find((a) => a.style === "dribble")?.points.at(-1);
    if (q) cones[3] = { ...mirror(p(Math.max(1, Math.min(w - 1, q.x + 1)), Math.max(1, Math.min(h - 1, q.y + 1)))), color: "blue" };
  }
  const source = f.sourceIds.map((id) => TECHNICAL_SOURCES.find((s) => s.id === id)!.title).join("; ");
  return nudgeCones({
    id: `tech2.${f.id}.${mode}.${side}.${route}`, title: f.title,
    group: f.focus === "finishing" ? "finish" : ["control", "carrying"].includes(f.focus) ? "dribble" : "touch",
    field: { ...f.field, ...(f.field.kind === "half" && !f.goal ? { origin: { x: side === "right" ? 68 - w : 0, y: 0 } } : {}) }, cones,
    arrows: arrows.map((a) => ({ ...a, points: a.points.map(mirror) })),
    actors: actors.map(mirror), stations: stations.map(mirror), targets: targets.map(mirror), ballStart: mirror(ball),
    ...(f.goal ? { goals: [{ x: w / 2, y: 1, width: 7.32 }] } : {}),
    goal: f.objective, dose: "Dawkę dobiera silnik sesji.", points: [...f.cues], source: `Autorska adaptacja zasad: ${source}`,
  });
}

/** Stabilne referencje dla istniejącego mechanizmu zaproszeń; wyników ani danych gracza w linku nie ma. */
export const TECHNICAL_REFERENCE_DRILLS: Drill[] = TECHNICAL_FAMILIES.flatMap((f) => f.modes.flatMap((mode) =>
  (["left", "right"] as const).flatMap((side) => ([0, 1] as const).map((route) => technicalScene(f, mode, side, route)))));
