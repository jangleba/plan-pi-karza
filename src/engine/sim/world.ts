import { GOAL, distToSegment, evaluate, shotChance } from "../iq";
import type { Option, Snapshot, Vec } from "../iq";
import { FIELD_H, FIELD_W } from "./types";
import type { Agent, EventType, Outcome, OutcomeKind, Role, SimEvent, Team, World } from "./types";

const hypot = Math.hypot;
const d2 = (a: Vec, b: Vec) => hypot(a.x - b.x, a.y - b.y);
const unit = (a: Vec, b: Vec): Vec => { const d = d2(a, b) || 1; return { x: (b.x - a.x) / d, y: (b.y - a.y) / d }; };
const mirror = (v: Vec): Vec => ({ x: FIELD_W - v.x, y: v.y });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const PASS_SPEED = 17; // m/s
export const SHOT_SPEED = 26;
export const CROSS_SPEED = 15;
const REACTION = 0.22; // s – czas reakcji obrońcy na lot piłki
const TACKLE_HOLD = 0.35; // s – tyle trzeba przeszkadzać posiadaczowi z bliska, by stracił piłkę
const TACKLE_RANGE = 1.15; // m
const CONTROL_TIME = 0.4; // s – tyle trwa przyjęcie piłki

export const agent = (w: World, id: string): Agent => {
  const a = w.agents.find((x) => x.id === id);
  if (!a) throw new Error(`Brak zawodnika ${id}`);
  return a;
};
export const owner = (w: World): Agent | null => (w.ball.owner ? agent(w, w.ball.owner) : null);
export const opposite = (t: Team): Team => (t === "us" ? "them" : "us");

/** Który zespół ma piłkę (posiadacz, nadawca podania albo ostatni dotyk). */
export function possession(w: World): Team | null {
  if (w.ball.owner) return agent(w, w.ball.owner).team;
  if (w.ball.flight) return agent(w, w.ball.flight.by).team;
  return w.ball.lastTouch ? agent(w, w.ball.lastTouch).team : null;
}

export function rand(w: World): number {
  let a = (w.seed + 0x6d2b79f5 * ++w.rn) | 0;
  a = Math.imul(a ^ (a >>> 15), a | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
}

function log(w: World, type: EventType, e: Omit<SimEvent, "t" | "type"> = {}): void {
  w.events.push({ t: +w.t.toFixed(3), type, ...e });
}

function end(w: World, kind: OutcomeKind): void {
  if (!w.outcome) w.outcome = { kind, t: w.t } satisfies Outcome;
}

/** Migawka dla silnika oceny opcji: zawsze „w naszą stronę” (dla rywali lustro). */
export function snapshotFor(w: World, o: Agent): Snapshot {
  const m = o.team === "them";
  const f = (v: Vec) => (m ? mirror(v) : v);
  const mates = w.agents.filter((a) => a.team === o.team && a.id !== o.id && a.role !== "GK").map((a) => ({ id: a.id, name: a.name, pos: f(a.pos) }));
  const defenders = w.agents.filter((a) => a.team !== o.team && a.role !== "GK").map((a) => f(a.pos));
  const gk = w.agents.find((a) => a.team !== o.team && a.role === "GK");
  return { t: w.t, ball: f(o.pos), mates, defenders, keeper: f(gk ? gk.pos : { x: 3, y: 34 }) };
}

export const options = (w: World, o: Agent): Option[] => evaluate(snapshotFor(w, o));

/** Linia spalonego drużyny atakującej (x w układzie boiska): przedostatni rywal albo piłka. */
export function offsideX(w: World, attacking: Team): number {
  const f = (x: number) => (attacking === "us" ? x : FIELD_W - x);
  const xs = w.agents.filter((a) => a.team !== attacking).map((a) => f(a.pos.x)).sort((p, q) => q - p);
  const line = Math.max(xs[1] ?? 0, f(w.ball.pos.x));
  return f(line);
}

/** Ruch zawodnika do celu z ograniczonym przyspieszeniem (płynny bieg, hamowanie przy dojściu). */
function moveTo(a: Agent, target: Vec, speed: number, dt: number, arrive = 0.3): void {
  const d = d2(a.pos, target);
  const want = Math.min(speed, d / arrive);
  const dir = d > 1e-6 ? { x: (target.x - a.pos.x) / d, y: (target.y - a.pos.y) / d } : { x: 0, y: 0 };
  let dvx = dir.x * want - a.vel.x, dvy = dir.y * want - a.vel.y;
  const dl = hypot(dvx, dvy), cap = 13 * dt;
  if (dl > cap) { dvx *= cap / dl; dvy *= cap / dl; }
  a.vel.x += dvx; a.vel.y += dvy;
  a.pos.x = clamp(a.pos.x + a.vel.x * dt, 0.5, FIELD_W - 0.5);
  a.pos.y = clamp(a.pos.y + a.vel.y * dt, 0.5, FIELD_H - 0.5);
  if (hypot(a.vel.x, a.vel.y) > 0.6) a.heading = Math.atan2(a.vel.y, a.vel.x);
}

const goalPoint = (t: Team): Vec => ({ x: t === "us" ? GOAL.x : 0, y: GOAL.y });

/* ---------------------------- AI: bez piłki ---------------------------- */

interface Plan { target: Vec; speed: number }

const nearest = (list: Agent[], p: Vec): Agent | undefined => list.reduce<Agent | undefined>((b, a) => (!b || d2(a.pos, p) < d2(b.pos, p) ? a : b), undefined);

/** Gdzie jest „akcja”: pozycja piłki albo miejsce jej przylotu. */
const focus = (w: World): Vec => (w.ball.flight ? w.ball.flight.to : w.ball.pos);

/** Rywale bronią: pressing, cień krycia, zwarte linie, linia obrony pilnująca napastnika. */
function planThemDefend(w: World, a: Agent): Plan {
  const b = focus(w), carrier = owner(w);
  const them = w.agents.filter((x) => x.team === "them");
  const us = w.agents.filter((x) => x.team === "us" && x.role !== "GK");
  if (a.role === "S") {
    const strikers = them.filter((x) => x.role === "S").sort((p, q) => d2(p.pos, b) - d2(q.pos, b));
    if (strikers[0]!.id === a.id) return { target: carrier ? { x: carrier.pos.x + 0.4, y: carrier.pos.y } : b, speed: 6.3 };
    // drugi napastnik: cień krycia na linii podania do najbliższego wyjścia (poza posiadaczem)
    const outlets = us.filter((x) => !carrier || x.id !== carrier.id).filter((x) => d2(x.pos, b) < 15).sort((p, q) => d2(p.pos, b) - d2(q.pos, b));
    const out = outlets[0];
    if (!out) return { target: { x: b.x + 4, y: b.y }, speed: 5.5 };
    const u = unit(b, out.pos);
    return { target: { x: b.x + u.x * 4.5, y: b.y + u.y * 4.5 }, speed: 6.1 };
  }
  if (a.role === "M") {
    const base = { x: a.home.x + clamp((b.x - 44) * 0.35, -8, 10), y: a.home.y + (b.y - 34) * 0.4 };
    // krycie strefowe: atakujący w pobliżu kotwicy – zawodnik schodzi na jego stronę bramki
    const mark = nearest(us.filter((x) => d2(x.pos, a.home) < 12 && (!carrier || x.id !== carrier.id)), a.home);
    if (mark) return { target: { x: mark.pos.x + 2.4, y: mark.pos.y + (a.home.y < mark.pos.y ? -0.8 : 0.8) }, speed: 5.9 };
    return { target: base, speed: 5.2 };
  }
  if (a.role === "D") {
    const lineX = a.home.x + clamp((b.x - 44) * 0.4, -6, 8);
    // pilnuje napastnika, który wbiega za linię: nie schodzi głębiej niż 1,5 m za nim
    const runner = us.filter((x) => x.pos.x > lineX - 2 && Math.abs(x.pos.y - a.home.y) < 10).sort((p, q) => q.pos.x - p.pos.x)[0];
    const x = runner ? Math.max(lineX, runner.pos.x + 1.5) : lineX;
    return { target: { x, y: a.home.y + (b.y - 34) * 0.2 }, speed: 5.6 };
  }
  // bramkarz
  return { target: { x: FIELD_W - 1.8, y: 34 + (b.y - 34) * 0.15 }, speed: 4.5 };
}

/** Znajdź wolne miejsce: z kilku kandydatów wokół celu wybieramy ten z najlepszą linią podania od piłki. */
function findOpen(w: World, a: Agent, target: Vec, from: Vec): Vec {
  const foes = w.agents.filter((x) => x.team !== a.team && x.role !== "GK");
  let best = target, bs = -1e9;
  for (const [dx, dy] of [[0, 0], [0, 4], [0, -4], [-3, 3], [-3, -3], [3, 4], [3, -4]] as const) {
    const c = { x: clamp(target.x + dx, 1, FIELD_W - 1), y: clamp(target.y + dy, 1, FIELD_H - 1) };
    const lane = Math.min(...foes.map((f) => distToSegment(f.pos, from, c)));
    const free = Math.min(...foes.map((f) => d2(f.pos, c)));
    const s = Math.min(lane, 6) * 2 + Math.min(free, 8) - Math.hypot(dx, dy) * 0.4;
    if (s > bs) { bs = s; best = c; }
  }
  return best;
}

/** Nasza drużyna z piłką (nie użytkownik): wsparcie – wychodzenie na wolne pozycje, napastnik na linii spalonego. */
function planUsSupport(w: World, a: Agent): Plan {
  const b = focus(w), carrier = owner(w);
  const line = offsideX(w, "us");
  const shift = { x: (b.x - 44) * 0.5, y: (b.y - 36) * 0.4 };
  if (a.role === "ST") {
    // napastnik trzyma się linii obrony (nie spalony); gdy piłka z przodu – wbiega w lukę
    const runIn = carrier && carrier.pos.x > 55 && carrier.id !== a.id;
    return { target: { x: Math.min(line - 0.8, runIn ? line + 2 : a.home.x + 8), y: 34 + (b.y - 34) * 0.3 }, speed: runIn ? 6.9 : 5.5 };
  }
  if (a.role === "W") return { target: { x: clamp(Math.max(a.home.x, b.x + 10), 40, line - 1), y: a.home.y + (b.y > 34 ? 0 : 0) }, speed: 5.8 };
  const base = { x: a.home.x + shift.x, y: clamp(a.home.y + shift.y, 4, 64) };
  const from = carrier ? carrier.pos : b;
  return { target: findOpen(w, a, base, from), speed: 5.7 };
}

/** Nasza drużyna broni po stracie: najbliższy zawodnik opóźnia (łapie linię do bramki), reszta zamyka linie. */
function planUsDefend(w: World, a: Agent): Plan {
  const carrier = owner(w), b = focus(w);
  const goal = { x: 0, y: 34 };
  const outfield = w.agents.filter((x) => x.team === "us" && x.role !== "GK" && x.id !== w.user);
  const jockey = carrier ? nearest(outfield, carrier.pos) : undefined;
  if (a.role === "GK") return { target: { x: 2.2, y: clamp(b.y, 28, 40) }, speed: 4.8 };
  if (jockey && jockey.id === a.id && carrier) {
    // opóźnianie: 3,5 m przed posiadaczem na linii do własnej bramki (nie wpada w wślizg)
    const u = unit(carrier.pos, goal);
    return { target: { x: carrier.pos.x + u.x * 3.5, y: carrier.pos.y + u.y * 3.5 }, speed: 6.0 };
  }
  // pozostali: zamykają środek między piłką a bramką, w odstępach
  const idx = outfield.filter((x) => x.id !== jockey?.id).sort((p, q) => p.home.y - q.home.y).findIndex((x) => x.id === a.id);
  const lane = [-9, 9, 0, -16, 16][Math.max(0, idx)] ?? 0;
  const depth = Math.max(10, b.x - 9);
  return { target: { x: clamp(depth, 8, 60), y: clamp(b.y + lane, 6, 62) }, speed: 6.0 };
}

/** Rywale po odbiorze: kontratak – trzech biegaczy w osobnych torach (na linii spalonego), reszta za nimi. */
function planThemAttack(w: World, a: Agent): Plan {
  const carrier = owner(w), b = focus(w);
  if (a.role === "GK") return { target: { x: FIELD_W - 1.8, y: 34 }, speed: 4 };
  // biegacze: trzech najbardziej wysuniętych (stały wybór według pozycji wyjściowej)
  const runners = w.agents
    .filter((x) => x.team === "them" && x.role !== "GK" && (!carrier || x.id !== carrier.id))
    .sort((p, q) => p.home.x - q.home.x || Math.abs(p.home.y - 34) - Math.abs(q.home.y - 34))
    .slice(0, 3)
    .sort((p, q) => p.home.y - q.home.y);
  const k = runners.findIndex((x) => x.id === a.id);
  if (k < 0) return { target: { x: Math.max(30, b.x - 8), y: a.home.y }, speed: 5.4 };
  const line = offsideX(w, "them");
  const lanes = [-14, 0, 14];
  const ahead = k === 1 ? 20 : 16;
  return { target: { x: Math.max(line + 0.8, Math.max(4, b.x - ahead)), y: clamp(b.y + (lanes[k] ?? 0), 5, 63) }, speed: 6.8 };
}

/** Plan ruchu zawodnika bez piłki. */
function plan(w: World, a: Agent): Plan {
  const poss = possession(w);
  if (a.team === "them") return poss === "them" ? planThemAttack(w, a) : planThemDefend(w, a);
  if (a.role === "GK") return planUsDefend(w, a);
  return poss === "them" ? planUsDefend(w, a) : planUsSupport(w, a);
}

/* ------------------------------ piłka ------------------------------ */

function take(w: World, a: Agent, type: EventType | null, immune = CONTROL_TIME): void {
  const prev = w.ball.owner ? agent(w, w.ball.owner) : null;
  w.ball.owner = a.id; w.ball.flight = null; w.ball.lastTouch = a.id;
  a.controlUntil = w.t + CONTROL_TIME;
  w.immuneUntil = w.t + immune;
  w.contact = {};
  if (type) log(w, type, { by: a.id, to: prev?.id, pos: { ...a.pos } });
}

/** Rzut piłki do celu z wyprzedzeniem: adresat biegnie, więc podanie leci tam, gdzie będzie. */
export function leadPoint(w: World, from: Vec, target: Agent): Vec {
  let p = { ...target.pos };
  for (let i = 0; i < 3; i++) {
    const T = d2(from, p) / PASS_SPEED;
    p = { x: clamp(target.pos.x + target.vel.x * T * 0.85, 1, FIELD_W - 1), y: clamp(target.pos.y + target.vel.y * T * 0.85, 1, FIELD_H - 1) };
  }
  return p;
}

/** Podanie od posiadacza `from` do `targetId` (piłka startuje z podanego miejsca, np. ze stopy). */
export function pass(w: World, fromId: string, targetId: string, spot?: Vec): boolean {
  if (w.ball.owner !== fromId || w.outcome) return false;
  const start = spot ?? { ...w.ball.pos };
  const tgt = agent(w, targetId);
  const to = leadPoint(w, start, tgt);
  w.ball.owner = null; w.ball.lastTouch = fromId;
  w.ball.flight = { from: start, to, t: 0, dur: Math.max(0.15, d2(start, to) / PASS_SPEED), kind: "pass", by: fromId, target: targetId };
  w.ball.pos = { ...start };
  log(w, "pass", { by: fromId, to: targetId, pos: start, info: { dist: +d2(start, to).toFixed(1) } });
  return true;
}

/** Strzał na bramkę przeciwnika; wynik rozstrzygany deterministycznie z ziarna. */
export function shoot(w: World, fromId: string, spot?: Vec): boolean {
  const a = agent(w, fromId);
  if (w.ball.owner !== fromId || w.outcome) return false;
  const snap = snapshotFor(w, a);
  const { p, blocked } = shotChance(snap);
  const start = spot ?? { ...w.ball.pos };
  const gk = w.agents.find((x) => x.team !== a.team && x.role === "GK");
  const to = { x: goalPoint(a.team).x, y: GOAL.y + (gk && gk.pos.y > GOAL.y ? -2.4 : 2.4) };
  w.ball.owner = null; w.ball.lastTouch = fromId;
  w.ball.flight = { from: start, to, t: 0, dur: Math.max(0.2, d2(start, to) / SHOT_SPEED), kind: "shot", by: fromId, target: null };
  w.ball.pos = { ...start };
  const r = rand(w);
  w.ball.flight.verdict = r < p ? "goal" : r < p + 0.38 ? "save" : "miss";
  log(w, "shot", { by: fromId, pos: start, info: { p: +p.toFixed(3), blocked, r: +r.toFixed(3) } });
  return true;
}

/** Dośrodkowanie: gdzie poleci piłka. Najlepiej ustawiony kolega w polu karnym (wolny, blisko 11. metra), a gdy nikogo nie ma, punkt przed bramką. */
export function crossPlan(w: World, fromId: string, from?: Vec): { to: Vec; target: Agent | null } {
  const a = agent(w, fromId);
  const start = from ?? a.pos;
  const dir = a.team === "us" ? 1 : -1;
  const spot = { x: goalPoint(a.team).x - dir * 11, y: GOAL.y };
  const foes = w.agents.filter((x) => x.team !== a.team && x.role !== "GK");
  const inBox = w.agents.filter((x) => x.team === a.team && x.id !== fromId && x.role !== "GK" && d2(x.pos, spot) < 14);
  const score = (x: Agent) => Math.min(6, Math.min(...foes.map((f) => d2(f.pos, x.pos)))) - d2(x.pos, spot) * 0.3;
  const best = inBox.sort((p, q) => score(q) - score(p))[0];
  if (best) return { to: leadPoint(w, start, best), target: best };
  return { to: spot, target: null };
}

/** Dośrodkowanie z dowolnego miejsca: wysokie podanie w pole karne. */
export function cross(w: World, fromId: string, spot?: Vec): boolean {
  if (w.ball.owner !== fromId || w.outcome) return false;
  const start = spot ?? { ...w.ball.pos };
  const { to, target } = crossPlan(w, fromId, start);
  w.ball.owner = null; w.ball.lastTouch = fromId;
  w.ball.flight = { from: start, to, t: 0, dur: Math.max(0.5, d2(start, to) / CROSS_SPEED), kind: "pass", high: true, by: fromId, target: target?.id ?? null };
  w.ball.pos = { ...start };
  log(w, "pass", { by: fromId, to: target?.id, pos: start, info: { dist: +d2(start, to).toFixed(1), cross: true } });
  return true;
}

/** Zwody użytkownika: „step” – zwód w bok na rywala przed sobą, „spin” – obrót przed rywalem z bliska (także z boku i zza pleców). */
export type FeintKind = "step" | "spin";
export interface FeintResult { won: boolean | null; foeId?: string }

export function feint(w: World, fromId: string, kind: FeintKind): FeintResult | null {
  const o = agent(w, fromId);
  if (w.ball.owner !== fromId || w.outcome || w.t - (w.lastFeint ?? -9) < 0.9) return null;
  w.lastFeint = w.t;
  const hx = Math.cos(o.heading), hy = Math.sin(o.heading);
  const foe = w.agents
    .filter((f) => f.team !== o.team && f.role !== "GK")
    .filter((f) => (kind === "step" ? d2(f.pos, o.pos) < 4 && (f.pos.x - o.pos.x) * hx + (f.pos.y - o.pos.y) * hy > 0 : d2(f.pos, o.pos) < 2.6))
    .sort((p, q) => d2(p.pos, o.pos) - d2(q.pos, o.pos))[0];
  if (!foe) return { won: null };
  const before = w.events.length;
  dribble(w, o, foe, kind === "step" ? 0.08 : 0.05, kind);
  const won = !!w.events.slice(before).find((e) => e.type === "dribble")?.info?.won;
  if (won && kind === "spin") { foe.stunUntil = w.t + 1.3; w.immuneUntil = w.t + 1.0; }
  return { won, foeId: foe.id };
}

function stepBall(w: World, dt: number): void {
  const b = w.ball, f = b.flight;
  if (b.owner) {
    const o = agent(w, b.owner);
    b.pos = { x: o.pos.x + Math.cos(o.heading) * 0.6, y: o.pos.y + Math.sin(o.heading) * 0.6 };
    return;
  }
  if (f) {
    f.t += dt;
    const k = Math.min(1, f.t / f.dur);
    b.pos = { x: f.from.x + (f.to.x - f.from.x) * k, y: f.from.y + (f.to.y - f.from.y) * k };
    return;
  }
  // piłka luźna: toczy się i wytraca prędkość
  b.pos = { x: clamp(b.pos.x + b.vel.x * dt, 0.3, FIELD_W - 0.3), y: clamp(b.pos.y + b.vel.y * dt, 0.3, FIELD_H - 0.3) };
  const damp = Math.exp(-dt * 1.4);
  b.vel = { x: b.vel.x * damp, y: b.vel.y * damp };
}

/** Czy obrońca `a` zdąży przeciąć tor piłki od `from` do `to` (ułamek `k0` drogi już za nią) – i gdzie. */
function interceptOnPath(a: Agent, from: Vec, to: Vec, dur: number, k0: number): Vec | null {
  const total = dur * (1 - k0);
  if (total <= 0) return null;
  const N = 14;
  for (let i = 1; i <= N; i++) {
    const k = k0 + (1 - k0) * (i / N);
    const p = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
    if (d2(a.pos, p) / a.vmax + REACTION <= total * (i / N)) return p;
  }
  return null;
}

/** Punkt przecięcia lotu piłki, który właśnie trwa. */
function interceptPoint(w: World, a: Agent): Vec | null {
  const f = w.ball.flight;
  if (!f || f.kind !== "pass" || f.high) return null; // wysoką piłkę mijają obrońcy, przecina się ją dopiero przy lądowaniu
  return interceptOnPath(a, f.from, f.to, f.dur, Math.min(1, f.t / f.dur));
}

/** Czy podanie z `start` do `target` zostałoby przechwycone przez któregoś rywala (model jak w grze). */
export function wouldBeIntercepted(w: World, start: Vec, target: Agent, byTeam: Team): boolean {
  const to = leadPoint(w, start, target);
  const dur = Math.max(0.15, d2(start, to) / PASS_SPEED);
  return w.agents.some((a) => a.team !== byTeam && a.role !== "GK" && interceptOnPath(a, start, to, dur, 0) !== null);
}

/** Drybling 1 na 1: szansa zależy od różnicy szybkości i dystansu; udany – obrońca jest wyminięty, nieudany – strata. */
function dribble(w: World, o: Agent, foe: Agent, bonus = 0, move?: FeintKind): void {
  w.lastDribble = w.t;
  const edge = (o.vmax - foe.vmax) * 0.18 + clamp((d2(foe.pos, o.pos) - 3) * 0.03, -0.05, 0.1);
  const p = clamp(0.48 + edge + bonus, 0.25, 0.78);
  const won = rand(w) < p;
  log(w, "dribble", { by: o.id, to: foe.id, pos: { ...o.pos }, info: move ? { won, p: +p.toFixed(2), move } : { won, p: +p.toFixed(2) } });
  if (won) {
    foe.stunUntil = w.t + 1.1;
    w.immuneUntil = w.t + 0.7;
    o.controlUntil = w.t + 0.15;
  } else {
    log(w, "tackle", { by: foe.id, to: o.id, pos: { ...o.pos } });
    take(w, foe, null, 1.0);
    log(w, "turnover", { by: foe.id, to: o.id });
  }
}

/* --------------------------- decyzje posiadacza --------------------------- */

function decideOwner(w: World, o: Agent): void {
  if (o.id === w.user || w.t < o.controlUntil || w.t - w.lastDecision < 0.22) return;
  w.lastDecision = w.t;
  const style = w.style ?? "mixed";
  const foes = w.agents.filter((x) => x.team !== o.team && x.role !== "GK");
  const pressure = Math.min(...foes.map((f) => d2(f.pos, o.pos)));
  const myGoal = goalPoint(o.team);
  const distGoal = d2(o.pos, myGoal);
  const dir = o.team === "us" ? 1 : -1;
  // z upływem czasu drużyna gra coraz bardziej bezpośrednio (akcja ma się rozstrzygnąć, a nie wygasnąć)
  const urgency = clamp((w.t - 9) / 12, 0, 1);
  // strzał z bliska, gdy jest realna szansa (z upływem czasu próg maleje, a zasięg rośnie)
  const sc = shotChance(snapshotFor(w, o));
  if (distGoal < 25 + urgency * 9 && sc.p > (pressure < 2.5 ? 0.06 : 0.1) * (1 - 0.6 * urgency)) { shoot(w, o.id); return; }
  // pod koniec czasu: strzał z dystansu zamiast wygaśnięcia akcji
  if (urgency > 0.75 && distGoal < 34) { shoot(w, o.id); return; }
  const open = options(w, o).some((x) => x.kind === "pass" && !x.offside && !x.blocked && x.score > 10 && dir * (agent(w, x.targetId!).pos.x - o.pos.x) > 0);
  if (distGoal < 19 && !open) { shoot(w, o.id); return; }
  // podania bezpieczne: nie na spalonym, bez zablokowanego toru, nie do przechwycenia
  const safe = options(w, o).filter((x) => x.kind === "pass" && !x.offside && !x.blocked && x.targetId && !wouldBeIntercepted(w, o.pos, agent(w, x.targetId), o.team));
  const progress = (x: { targetId?: string }) => dir * (agent(w, x.targetId!).pos.x - o.pos.x);
  const us = o.team === "us";
  // „ściana”: ten, kto mi właśnie podał (np. Ty), wyszedł na wolne miejsce (nie jest za mną) – oddaję mu piłkę w bieg
  if (us && (style === "wall" || style === "mixed")) {
    const lastIn = [...w.events].reverse().find((e) => e.type === "pass" && e.to === o.id);
    const from = lastIn?.by ? agent(w, lastIn.by) : null;
    if (lastIn && from && from.team === o.team && w.t - lastIn.t > 0.7 && w.t - lastIn.t < 7 && dir * (from.pos.x - o.pos.x) > -2) {
      const opt = options(w, o).find((x) => x.kind === "pass" && x.targetId === from.id);
      if (opt && !opt.offside && !opt.blocked && !wouldBeIntercepted(w, o.pos, from, o.team) && rand(w) < (style === "wall" ? 0.9 : 0.55)) { pass(w, o.id, from.id); return; }
    }
  }
  // zmiana strony gry: wolny kolega po drugiej stronie boiska, bez cofania piłki
  if (us && (style === "switch" || style === "mixed")) {
    const far = safe.filter((x) => Math.abs(agent(w, x.targetId!).pos.y - o.pos.y) >= 22 && progress(x) > -4).sort((p, q) => q.score - p.score)[0];
    if (far && far.score > 5 && rand(w) < (style === "switch" ? 0.8 : 0.3)) { pass(w, o.id, far.targetId!); return; }
  }
  // drybling 1 na 1 w połowie rywala: szybki zawodnik, rywal tuż przed nim
  if (us && (style === "dribble" || style === "mixed") && o.pos.x > 45 && ["W", "ST", "M", "FB"].includes(o.role) && w.t - (w.lastDribble ?? -9) > 1.4) {
    const foe = foes.filter((f) => dir * (f.pos.x - o.pos.x) > 0 && d2(f.pos, o.pos) < 6.5).sort((p, q) => d2(p.pos, o.pos) - d2(q.pos, o.pos))[0];
    if (foe && rand(w) < (style === "dribble" ? 0.7 : 0.3)) { dribble(w, o, foe); return; }
  }
  const forward = safe.filter((x) => progress(x) > 6).sort((p, q) => q.score - p.score)[0];
  if (forward && forward.score > 8 - 5 * urgency) { pass(w, o.id, forward.targetId!); return; }
  // zaraz stracimy piłkę: odgrywa najbezpieczniej (może do tyłu / w bok)
  if (pressure < 1.8) {
    const out = safe.sort((p, q) => progress(q) - progress(p))[0];
    if (out) { pass(w, o.id, out.targetId!); return; }
  }
  // inaczej niesie piłkę do przodu
  o.heading = unitHeading(o.pos, myGoal);
}

const unitHeading = (a: Vec, b: Vec) => Math.atan2(b.y - a.y, b.x - a.x);

/* ------------------------------- krok ------------------------------- */

/** Ustawia pozycję zawodnika sterowanego przez użytkownika (poza symulacją). */
export function setUser(w: World, pos: Vec, heading: number, speed: number): void {
  if (!w.user) return;
  const a = agent(w, w.user);
  a.vel = { x: Math.cos(heading) * speed, y: Math.sin(heading) * speed };
  a.pos = { ...pos }; a.heading = heading;
}

export function step(w: World, dt: number): void {
  if (w.outcome) return;
  w.t += dt;
  const poss0 = possession(w);

  // ruch zawodników według planu (użytkownik porusza się sam; posiadacz-AI niesie piłkę ku bramce)
  for (const a of w.agents) {
    if (a.id === w.user) continue;
    // wyminięty dryblingiem: prawie stoi
    if ((a.stunUntil ?? 0) > w.t) { moveTo(a, a.pos, 0, dt); continue; }
    if (w.ball.owner === a.id) {
      const g = goalPoint(a.team), dirX = a.team === "us" ? 1 : -1;
      // rywal na drodze: omija go bokiem (w stronę, w którą ma więcej miejsca)
      const blocker = w.agents.filter((x) => x.team !== a.team && x.role !== "GK" && (x.pos.x - a.pos.x) * dirX > 0 && d2(x.pos, a.pos) < 4.5 && Math.abs(x.pos.y - a.pos.y) < 2.2).sort((p, q) => d2(p.pos, a.pos) - d2(q.pos, a.pos))[0];
      const tgt = blocker
        ? { x: a.pos.x + dirX * 2.5, y: clamp(a.pos.y + (a.pos.y >= blocker.pos.y ? 1 : -1) * 4, 3, FIELD_H - 3) }
        : { x: a.team === "us" ? g.x - 10 : g.x + 10, y: clamp(a.pos.y + (34 - a.pos.y) * (d2(a.pos, g) < 40 ? 0.3 : 0.08), 5, 63) };
      moveTo(a, tgt, a.vmax * (w.t < a.controlUntil ? 0.2 : 0.95), dt);
      continue;
    }
    // zawodnik, który przyjmuje podanie, biegnie na miejsce przylotu piłki
    const f = w.ball.flight;
    if (f && f.kind === "pass" && f.target === a.id) { moveTo(a, f.to, a.vmax, dt, 0.2); continue; }
    // obrońcy przeciwnej drużyny idą na przecięcie lotu piłki, jeśli zdążą
    if (f && f.kind === "pass" && agent(w, f.by).team !== a.team && a.role !== "GK") {
      const p = interceptPoint(w, a);
      if (p) { moveTo(a, p, a.vmax, dt, 0.15); continue; }
    }
    const pl = plan(w, a);
    moveTo(a, pl.target, Math.min(a.vmax, pl.speed), dt);
  }

  stepBall(w, dt);
  const b = w.ball;

  // przechwyt w locie (podanie): najbliższy rywal w zasięgu 0,8 m od piłki
  if (b.flight && b.flight.kind === "pass") {
    const by = agent(w, b.flight.by);
    const foe = w.agents.filter((a) => a.team !== by.team && a.role !== "GK").sort((p, q) => d2(p.pos, b.pos) - d2(q.pos, b.pos))[0];
    const low = !b.flight.high || b.flight.t / b.flight.dur >= 0.8;
    if (low && foe && d2(foe.pos, b.pos) < 0.85) {
      log(w, "intercept", { by: foe.id, to: by.id, pos: { ...b.pos } });
      take(w, foe, null, 1.0);
      log(w, "turnover", { by: foe.id, to: by.id });
    } else if (b.flight.t >= b.flight.dur) {
      // dolot: adresat przyjmuje piłkę, jeśli jest blisko; w przeciwnym razie piłka luźna
      const tgt = b.flight.target ? agent(w, b.flight.target) : null;
      if (tgt && d2(tgt.pos, b.pos) < 2.2) take(w, tgt, "control");
      else {
        const dir = unit(b.flight.from, b.flight.to);
        const v = b.flight.high ? 1.5 : 4;
        b.flight = null; b.owner = null; b.vel = { x: dir.x * v, y: dir.y * v };
      }
    }
  } else if (b.flight && b.flight.kind === "shot") {
    // strzał: wynik wcześniej wyznaczony; rozstrzygnięcie po dolocie
    if (b.flight.t >= b.flight.dur) {
      const v = b.flight.verdict ?? "miss";
      const by = agent(w, b.flight.by);
      const our = by.team === "us";
      log(w, v === "goal" ? "goal" : v === "save" ? "save" : "miss", { by: by.id, pos: { ...b.pos } });
      end(w, (v === "goal" ? (our ? "goal_for" : "goal_against") : v === "save" ? (our ? "saved_for" : "saved_against") : our ? "miss_for" : "miss_against") as OutcomeKind);
      b.flight = null;
    }
  } else if (!b.owner) {
    // piłka luźna: pierwszy zawodnik w zasięgu 1 m ją przejmuje
    const first = [...w.agents].sort((p, q) => d2(p.pos, b.pos) - d2(q.pos, b.pos))[0];
    if (first && d2(first.pos, b.pos) < 1.0) take(w, first, "control");
    else if (first) {
      // najbliżsi z każdej drużyny biegną po piłkę
      for (const team of ["us", "them"] as const) {
        const c = nearest(w.agents.filter((a) => a.team === team && a.role !== "GK" && a.id !== w.user), b.pos);
        if (c) moveTo(c, b.pos, c.vmax, dt, 0.1);
      }
    }
  }

  // odbiór piłki: rywal blisko posiadacza przez TACKLE_HOLD s, po stronie bramki posiadacza
  const o = owner(w);
  if (o && w.t >= w.immuneUntil) {
    const g = goalPoint(o.team);
    for (const a of w.agents) {
      if (a.team === o.team || a.role === "GK") continue;
      const key = `${a.id}>${o.id}`;
      const close = d2(a.pos, o.pos) < TACKLE_RANGE;
      const sideOk = d2(a.pos, g) < d2(o.pos, g) + 0.4; // stoi między posiadaczem a bramką (albo obok)
      // z boku/przodu odbiór jest szybki; od tyłu (doganianie) znacznie trudniejszy
      w.contact[key] = close ? (w.contact[key] ?? 0) + dt * (sideOk ? 1 : 0.3) : 0;
      if ((w.contact[key] ?? 0) >= TACKLE_HOLD) {
        log(w, "tackle", { by: a.id, to: o.id, pos: { ...o.pos } });
        take(w, a, null, 1.0);
        log(w, "turnover", { by: a.id, to: o.id });
        break;
      }
    }
  }

  // posiadacz-AI podejmuje decyzję
  const o2 = owner(w);
  if (o2) decideOwner(w, o2);

  // zmiana posiadania: kontratak / odzyskanie
  const poss1 = possession(w);
  if (poss0 && poss1 && poss0 !== poss1 && w.events.length) {
    log(w, poss1 === "them" ? "counter" : "regain", { by: w.ball.owner ?? undefined });
    if (poss1 === "us" && w.events.some((e) => e.type === "turnover")) end(w, "regain");
  }
  // koniec czasu: akcja ma się rozstrzygnąć. Posiadacz sterowany przez AI kończy ją strzałem, podanie w locie i piłka luźna dostają chwilę
  // (do 6 s dogrywki), a „czas minął” zostaje tylko wtedy, gdy piłkę trzyma użytkownik i nie zagrał
  if (w.t >= w.limit && !w.outcome) {
    const ow = owner(w);
    if (ow && ow.id !== w.user) shoot(w, ow.id);
    else if (w.t >= w.limit + 6 || (ow && ow.id === w.user)) { log(w, "timeout"); end(w, "timeout"); }
  }
}

/** Stała tworząca zawodnika. */
export function makeAgent(id: string, name: string, team: Team, role: Role, number: number, x: number, y: number, vmax: number): Agent {
  return { id, name, team, role, number, pos: { x, y }, vel: { x: 0, y: 0 }, heading: team === "us" ? 0 : Math.PI, vmax, home: { x, y }, controlUntil: 0 };
}
