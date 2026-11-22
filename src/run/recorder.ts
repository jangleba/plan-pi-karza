import { activeMs, emptyClock, isPaused, pauseClock, resumeClock, startClock, type ClockState } from "../engine/runClock";
import { gpsState, type GpsState } from "../engine/gps";
import { addPoint, emptyTrack, type TrackState } from "../engine/track";
import { scoped } from "../lib/store";
import { getNativeTracker, type NativeSample } from "./native";

/**
 * Rejestrator biegu: działa niezależnie od ekranu (minimalizacja widoku go nie zatrzymuje).
 * Czas liczy ze znaczników czasu i pauz, punkty GPS dostają czas aktywny z chwili pomiaru, a stan aktywnej sesji jest na bieżąco
 * zapisywany lokalnie – po przerwaniu procesu sesja wraca jako PAUZA od ostatniej potwierdzonej chwili (brakujące minuty nie są „nagrane”).
 */
export type RecStatus = "idle" | "ready" | "running" | "paused" | "done";
export interface Fix { lat: number; lon: number; acc: number; at: number; speed: number | null; heading: number | null }
export interface RecSnapshot {
  status: RecStatus;
  title: string | null;
  clock: ClockState;
  track: TrackState;
  fix: Fix | null;
  error: "denied" | "unavailable" | null;
  /** Sesja odtworzona po przerwaniu procesu: od tej chwili (ms epoki) brak zapisu. */
  interruptedAt: number | null;
  /** Ostateczny czas po zakończeniu (ms), żeby zapis nie zależał od opóźnionego stanu UI. */
  finalMs: number | null;
  native: boolean;
}

const KEY = "activeRun";
const HEARTBEAT_MS = 4000;

let snap: RecSnapshot = fresh();
let watchId: number | null = null;
let wake: { release: () => Promise<void> } | null = null;
let seg = 0;
let hb: ReturnType<typeof setInterval> | null = null;
let lastPersist = 0;
let visBound = false;
const subs = new Set<() => void>();

function fresh(): RecSnapshot {
  return { status: "idle", title: null, clock: emptyClock(), track: emptyTrack(), fix: null, error: null, interruptedAt: null, finalMs: null, native: false };
}
function set(patch: Partial<RecSnapshot>, persist = true) {
  snap = { ...snap, ...patch };
  if (persist) save();
  subs.forEach((f) => f());
}
export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const getSnapshot = (): RecSnapshot => snap;
export const nowMs = () => Date.now();
/** Czas aktywny (ms) w chwili `at` albo ostateczny po zakończeniu. */
export const elapsedMs = (s: RecSnapshot = snap, at = nowMs()): number => (s.status === "done" && s.finalMs !== null ? s.finalMs : activeMs(s.clock, at));
export const gpsOf = (s: RecSnapshot, at = nowMs()): GpsState => gpsState({ fix: s.fix ? { at: s.fix.at, acc: s.fix.acc } : null, now: at, error: s.error });

// ---------- trwały zapis aktywnej sesji ----------
interface Saved { v: 1; title: string | null; status: "running" | "paused"; clock: ClockState; points: TrackState["points"]; distanceM: number; marks: TrackState["marks"]; seenAt: number; seg: number }
function save(force = false) {
  const t = Date.now();
  if (!force && t - lastPersist < 2500 && snap.status === "running") return;
  lastPersist = t;
  if (snap.status !== "running" && snap.status !== "paused") return;
  const s: Saved = { v: 1, title: snap.title, status: snap.status, clock: snap.clock, points: snap.track.points, distanceM: snap.track.distanceM, marks: snap.track.marks, seenAt: t, seg };
  scoped.setItem(KEY, JSON.stringify(s));
}
export function readSaved(): Saved | null {
  try {
    const x = JSON.parse(scoped.getItem(KEY) ?? "null") as Saved | null;
    return x && x.v === 1 && (x.status === "running" || x.status === "paused") && x.clock && Array.isArray(x.points) ? x : null;
  } catch { return null; }
}
export const hasSavedRun = () => readSaved() !== null;
export function clearSaved() { scoped.removeItem(KEY); }

/** Odtwarza sesję zapisaną przed przerwaniem procesu – jako pauzę od ostatniej potwierdzonej chwili. */
export function restore(): boolean {
  if (snap.status !== "idle") return snap.status === "running" || snap.status === "paused";
  const s = readSaved();
  if (!s) return false;
  let clock = s.clock;
  const interruptedAt = s.status === "running" ? s.seenAt : null;
  if (!isPaused(clock)) clock = pauseClock(clock, s.seenAt);
  seg = s.seg;
  set({ status: "paused", title: s.title, clock, track: { points: s.points, distanceM: s.distanceM, marks: s.marks }, interruptedAt, fix: null, error: null, finalMs: null }, false);
  return true;
}

// ---------- GPS ----------
function onSample(s: { lat: number; lon: number; acc: number; at: number; speed?: number | null; heading?: number | null }) {
  const fix: Fix = { lat: s.lat, lon: s.lon, acc: s.acc, at: s.at, speed: s.speed ?? null, heading: s.heading ?? null };
  if (snap.status === "running") {
    const t = activeMs(snap.clock, s.at);
    set({ fix, error: null, track: addPoint(snap.track, { lat: s.lat, lon: s.lon, acc: s.acc, t, seg }) });
  } else set({ fix, error: null }, false);
}
function startWatch() {
  if (getNativeTracker()) return; // w tle zbiera warstwa natywna, punkty odbieramy przez drain()
  if (watchId !== null || !("geolocation" in navigator)) { if (!("geolocation" in navigator)) set({ error: "unavailable" }, false); return; }
  watchId = navigator.geolocation.watchPosition(
    (pos) => onSample({ lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy, at: pos.timestamp || Date.now(), speed: pos.coords.speed, heading: pos.coords.heading }),
    // przekroczenie czasu (kod 3) zdarza się chwilowo – śledzenie trwa dalej
    (e) => { if (e.code === 1) set({ error: "denied" }, false); else if (e.code === 2) set({ error: "unavailable" }, false); },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
  );
}
function stopWatch() { if (watchId !== null) navigator.geolocation.clearWatch(watchId); watchId = null; }
async function drainNative() {
  const n = getNativeTracker(); if (!n) return;
  try { for (const p of (await n.drain()).sort((a, b) => a.timestamp - b.timestamp)) onSample({ lat: p.lat, lon: p.lon, acc: p.acc, at: p.timestamp, speed: p.speed, heading: p.heading }); } catch { /* brak punktów */ }
}
async function keepAwake() {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    wake = (await nav.wakeLock?.request("screen")) ?? null;
  } catch { /* ekran może zgasnąć */ }
}
function releaseAwake() { void wake?.release(); wake = null; }

function bindLifecycle() {
  if (visBound || typeof document === "undefined") return;
  visBound = true;
  // po powrocie do aplikacji system potrafi zatrzymać GPS i zwolnić blokadę ekranu: włączamy je ponownie, a punkty natywne dociągamy
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || (snap.status !== "running" && snap.status !== "ready")) return;
    stopWatch(); startWatch(); void drainNative();
    if (snap.status === "running") void keepAwake();
  });
}
function startHeartbeat() {
  if (hb) return;
  hb = setInterval(() => { if (snap.status === "running") { void drainNative(); save(true); set({}, false); } }, HEARTBEAT_MS);
}
function stopHeartbeat() { if (hb) clearInterval(hb); hb = null; }

// ---------- sterowanie ----------
/** Ekran gotowości: łapiemy sygnał GPS jeszcze bez nagrywania (żeby start był od razu dokładny). */
export function prepare(title: string) {
  if (snap.status !== "idle") return;
  bindLifecycle(); startWatch();
  set({ status: "ready", title, fix: null, error: null }, false);
}
export function cancelPrepare() {
  if (snap.status !== "ready") return;
  stopWatch(); snap = fresh(); subs.forEach((f) => f());
}
export function start(title: string) {
  if (snap.status !== "ready" && snap.status !== "idle") return;
  bindLifecycle(); startWatch();
  seg = 0;
  const n = getNativeTracker(); if (n) void n.start().catch(() => {});
  set({ status: "running", title, clock: startClock(nowMs()), track: emptyTrack(), interruptedAt: null, finalMs: null, native: !!n });
  startHeartbeat(); void keepAwake(); save(true);
}
export function pause() {
  if (snap.status !== "running") return;
  set({ status: "paused", clock: pauseClock(snap.clock, nowMs()) }); save(true);
  stopWatch(); releaseAwake();
  const n = getNativeTracker(); if (n) void n.stop().catch(() => {});
}
export function resume() {
  if (snap.status !== "paused") return;
  const last = snap.track.points[snap.track.points.length - 1];
  seg = last ? (last.seg ?? 0) + 1 : seg; // nowy odcinek zapisu: bez dystansu i linii przez czas pauzy
  bindLifecycle(); startWatch();
  const n = getNativeTracker(); if (n) void n.start().catch(() => {});
  set({ status: "running", clock: resumeClock(snap.clock, nowMs()), interruptedAt: snap.interruptedAt, fix: null });
  startHeartbeat(); void keepAwake(); save(true);
}
export async function finish() {
  if (snap.status !== "running" && snap.status !== "paused") return;
  if (snap.status === "running") await drainNative();
  const end = nowMs();
  const clock = snap.status === "paused" ? snap.clock : pauseClock(snap.clock, end);
  stopWatch(); stopHeartbeat(); releaseAwake();
  const n = getNativeTracker(); if (n) void n.stop().catch(() => {});
  set({ status: "done", clock, finalMs: activeMs(clock, end) }, false);
  // zapis roboczy zostaje do potwierdzonego zapisu zakończonego biegu
  const s = readSaved(); if (s) scoped.setItem(KEY, JSON.stringify({ ...s, status: "paused", clock, points: snap.track.points, distanceM: snap.track.distanceM, marks: snap.track.marks, seenAt: end }));
}
/** Po potwierdzonym zapisie (albo świadomym odrzuceniu) czyścimy wszystko. */
export function reset() {
  stopWatch(); stopHeartbeat(); releaseAwake(); clearSaved();
  const n = getNativeTracker(); if (n) void n.stop().catch(() => {});
  snap = fresh(); subs.forEach((f) => f());
}
/** Tylko do testów. */
export function _debugEmit(s: NativeSample) { onSample({ lat: s.lat, lon: s.lon, acc: s.acc, at: s.timestamp, speed: s.speed, heading: s.heading }); }
