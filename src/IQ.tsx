import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GOAL, SCENARIO_RUN_IN_BEHIND as S, compare, snapshotAt } from "./engine";
import type { Snapshot, Vec, Verdict } from "./engine";
import { TacticalBoard } from "./TacticalBoard";
import { Sheet } from "./Sheet";
import { LargeTitle } from "./ui";
import { FIELD, animateFigure, headingOf, makeBall, makeGoal, makePlayer, pitchTexture, skyTexture, type Figure } from "./iq/scene";

const SPEED = 6.5;
interface Result { snap: Snapshot; verdict: Verdict }
type Phase = "intro" | "play" | "flight" | "done";

export default function IQ() {
  const mount = useRef<HTMLDivElement>(null);
  const joy = useRef({ x: 0, y: 0 });
  const act = useRef<"pass" | "shot" | null>(null);
  const phaseRef = useRef<Phase>("intro");
  const reset = useRef<() => void>(() => {});
  const [phase, setPhase] = useState<Phase>("intro");
  const [result, setResult] = useState<Result | null>(null);
  const [clock, setClock] = useState(0);
  const [aimName, setAimName] = useState<string | null>(null);

  const setP = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  useEffect(() => {
    const el = mount.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    // jakość startowa; obniżana automatycznie, jeśli telefon nie wyrabia 60 kl./s
    let dpr = Math.min(window.devicePixelRatio, 1.75);
    renderer.setPixelRatio(dpr);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = skyTexture();
    scene.fog = new THREE.Fog(0xeef5fc, 70, 170);
    const cam = new THREE.PerspectiveCamera(55, 1, 0.1, 400);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x5f8f62, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 120 });
    sun.shadow.bias = -0.0005;
    scene.add(sun, sun.target);

    // otoczenie boiska i murawa
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.w + 40, FIELD.h + 40), new THREE.MeshStandardMaterial({ color: 0x4f9a5c, roughness: 1 }));
    apron.rotation.x = -Math.PI / 2; apron.position.set(FIELD.w / 2, -0.01, FIELD.h / 2); apron.receiveShadow = true; scene.add(apron);
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.w, FIELD.h), new THREE.MeshStandardMaterial({ map: pitchTexture(), roughness: 0.95 }));
    pitch.rotation.x = -Math.PI / 2; pitch.position.set(FIELD.w / 2, 0, FIELD.h / 2); pitch.receiveShadow = true; scene.add(pitch);
    scene.add(makeGoal(FIELD.w, 1), makeGoal(0, -1));

    // zawodnicy: my (granat), koledzy (błękit), rywale (czerwień), bramkarz rywali (żółty)
    const me = makePlayer(0x1f4f86, 0xffffff);
    const mates = S.mates.map(() => makePlayer(0x2f6fb3, 0xffffff));
    const defs = [...S.backLine, ...S.pressers].map(() => makePlayer(0xc8443f, 0x1d1d1f));
    const gk = makePlayer(0xe0b23a, 0x1d1d1f);
    for (const f of [me, ...mates, ...defs, gk]) scene.add(f.root);
    const ball = makeBall(); scene.add(ball);

    // celowanie: pierścień pod adresatem i przerywana linia
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; scene.add(ring);
    const aimLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.6, gapSize: 0.4, transparent: true, opacity: 0.85 }));
    scene.add(aimLine);
    const meMarker = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 32), new THREE.MeshBasicMaterial({ color: 0x8ec1f0, side: THREE.DoubleSide }));
    meMarker.rotation.x = -Math.PI / 2; scene.add(meMarker);

    let player: Vec = { ...S.player };
    let facing: Vec = { x: 1, y: 0 };
    let t = 0;
    const prev = new Map<Figure, Vec>();
    let flight: { from: Vec; to: Vec; k: number; dur: number; lift: number; done: () => void } | null = null;
    const keys = new Set<string>();
    const kd = (e: KeyboardEvent) => keys.add(e.key.toLowerCase());
    const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);

    const camPos = new THREE.Vector3(player.x - 10, 5.2, player.y);
    const camLook = new THREE.Vector3(player.x + 10, 0.6, player.y);
    const target = new THREE.Vector3(), look = new THREE.Vector3();
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(el);

    reset.current = () => {
      player = { ...S.player }; facing = { x: 1, y: 0 }; t = 0; flight = null; act.current = null;
      setResult(null); setClock(0); setP("intro");
    };

    const place = (f: Figure, p: Vec, dt: number, faceTo?: Vec) => {
      const old = prev.get(f) ?? p;
      const v = Math.hypot(p.x - old.x, p.y - old.y) / Math.max(dt, 1e-3);
      const dir = v > 0.3 ? headingOf(p.x - old.x, p.y - old.y) : faceTo ? headingOf(faceTo.x - p.x, faceTo.y - p.y) : f.root.rotation.y;
      f.root.position.x = p.x; f.root.position.z = p.y;
      animateFigure(f, v, dt, dir);
      prev.set(f, { ...p });
    };

    let last = performance.now(), raf = 0, clockAcc = 0;
    let lastAim: string | null = null;
    let perfFrames = 0, perfTime = 0, perfStep = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const raw = (now - last) / 1000; last = now;
      const dt = Math.min(0.05, raw);
      if (document.hidden) return;
      // adaptacja jakości: co ok. 1,5 s sprawdzamy średni czas klatki
      perfFrames++; perfTime += raw;
      if (perfFrames >= 90) {
        const avg = perfTime / perfFrames;
        if (avg > 0.022 && perfStep === 0 && dpr > 1) { dpr = 1; renderer.setPixelRatio(dpr); resize(); perfStep = 1; }
        else if (avg > 0.026 && perfStep <= 1 && sun.castShadow) { sun.castShadow = false; perfStep = 2; }
        perfFrames = 0; perfTime = 0;
      }
      const ph = phaseRef.current;

      let jx = joy.current.x, jy = joy.current.y;
      if (keys.has("w") || keys.has("arrowup")) jy -= 1;
      if (keys.has("s") || keys.has("arrowdown")) jy += 1;
      if (keys.has("a") || keys.has("arrowleft")) jx -= 1;
      if (keys.has("d") || keys.has("arrowright")) jx += 1;
      const mv = { x: -jy, y: jx };
      const mag = Math.min(1, Math.hypot(mv.x, mv.y));
      if (ph === "play") {
        t += dt;
        clockAcc += dt; if (clockAcc > 0.1) { clockAcc = 0; setClock(t); }
        if (mag > 0.05) {
          const n = { x: mv.x / Math.hypot(mv.x, mv.y), y: mv.y / Math.hypot(mv.x, mv.y) };
          facing = n;
          player = { x: Math.max(1, Math.min(104, player.x + n.x * SPEED * mag * dt)), y: Math.max(1, Math.min(67, player.y + n.y * SPEED * mag * dt)) };
        }
      }
      const snap = snapshotAt(S, t, player);

      // adresat podania: kolega najbliżej kierunku zawodnika
      let aim: string | null = null, bestCos = 0.2;
      for (const m of snap.mates) {
        const dx = m.pos.x - player.x, dy = m.pos.y - player.y, d = Math.hypot(dx, dy) || 1;
        const cos = (dx * facing.x + dy * facing.y) / d;
        if (cos > bestCos) { bestCos = cos; aim = m.id; }
      }
      const aimMate = snap.mates.find((m) => m.id === aim);

      if (ph === "play" && act.current) {
        const a = act.current; act.current = null;
        const chosen = a === "shot" ? { kind: "shot" as const } : aimMate ? { kind: "pass" as const, targetId: aimMate.id } : null;
        if (chosen) {
          const to = a === "shot" ? { x: GOAL.x + 0.5, y: GOAL.y + (player.y > GOAL.y ? -2.4 : 2.4) } : aimMate!.pos;
          const d = Math.hypot(to.x - player.x, to.y - player.y);
          const verdict = compare(snap, chosen);
          setP("flight");
          flight = { from: { ...player }, to, k: 0, dur: Math.min(1.4, d / (a === "shot" ? 28 : 20)), lift: a === "shot" ? 1.4 : 0.5,
            done: () => { setResult({ snap, verdict }); setP("done"); } };
        }
      }

      place(me, player, dt);
      snap.mates.forEach((m, i) => place(mates[i]!, m.pos, dt, player));
      snap.defenders.forEach((d, i) => place(defs[i]!, d, dt, player));
      place(gk, snap.keeper, dt, player);
      meMarker.position.set(player.x, 0.02, player.y);

      if (flight) {
        flight.k = Math.min(1, flight.k + dt / flight.dur);
        const k = flight.k;
        ball.position.set(flight.from.x + (flight.to.x - flight.from.x) * k, 0.16 + Math.sin(Math.PI * k) * flight.lift, flight.from.y + (flight.to.y - flight.from.y) * k);
        ball.rotation.z -= dt * 20;
        if (k >= 1) { const done = flight.done; flight = null; done(); }
      } else if (ph !== "done") {
        ball.position.set(player.x + facing.x * 0.55, 0.16, player.y + facing.y * 0.55);
        if (mag > 0.05 && ph === "play") ball.rotation.z -= dt * SPEED * mag * 4;
      }

      const showAim = !!aimMate && ph === "play";
      ring.visible = showAim; aimLine.visible = showAim;
      if (aimMate) {
        const pulse = 1 + Math.sin(now / 180) * 0.08;
        ring.position.set(aimMate.pos.x, 0.03, aimMate.pos.y); ring.scale.setScalar(pulse);
        const pos = aimLine.geometry.attributes.position as THREE.BufferAttribute;
        pos.setXYZ(0, player.x, 0.05, player.y); pos.setXYZ(1, aimMate.pos.x, 0.05, aimMate.pos.y); pos.needsUpdate = true;
        aimLine.computeLineDistances();
      }
      // stan Reacta tylko przy zmianie – bez przerysowywania interfejsu w każdej klatce
      const aimNow = showAim ? aimMate!.name : null;
      if (aimNow !== lastAim) { lastAim = aimNow; setAimName(aimNow); }

      // kamera płynnie za zawodnikiem, światło i cienie podążają za akcją
      target.set(player.x - 10, 5.2, player.y);
      look.set(player.x + 12, 0.6, player.y);
      const a = 1 - Math.exp(-dt * 5);
      camPos.lerp(target, a); camLook.lerp(look, a);
      cam.position.copy(camPos); cam.lookAt(camLook);
      sun.position.set(player.x - 15, 40, player.y + 20); sun.target.position.set(player.x + 8, 0, player.y);
      renderer.render(scene, cam);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku);
      renderer.dispose(); el.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <main className="mx-auto max-w-md px-5 pb-28 pt-14">
      <LargeTitle kind="iq" title="IQ" sub={S.title} />
      <div className="relative overflow-hidden rounded-3xl border border-hairline bg-hairline shadow-sm">
        <div ref={mount} className="h-[58vh] min-h-[340px] w-full" />

        {phase === "play" && (
          <>
            <div className="absolute left-3 top-3 flex items-center gap-2">
              <span className="rounded-full bg-white/85 px-3 py-1 text-xs font-medium tabular-nums text-ink backdrop-blur">{clock.toFixed(1)} s</span>
              {aimName && <span className="bw-pop rounded-full bg-white/85 px-3 py-1 text-xs text-accent backdrop-blur">Podanie do: {aimName}</span>}
            </div>
            <Joystick onChange={(x, y) => { joy.current = { x, y }; }} />
            <div className="absolute bottom-5 right-4 flex flex-col items-center gap-3">
              <ActionButton label="Podaj" onTap={() => { act.current = "pass"; }} />
              <ActionButton label="Strzał" onTap={() => { act.current = "shot"; }} />
            </div>
          </>
        )}

        {phase === "intro" && (
          <div className="bw-backdrop absolute inset-0 flex items-end bg-gradient-to-t from-black/45 via-black/10 to-transparent p-4">
            <div className="bw-sheet w-full rounded-3xl bg-white/95 p-5 backdrop-blur">
              <div className="text-xs uppercase tracking-wide text-muted">Sytuacja</div>
              <p className="mt-1 text-[15px] leading-snug text-ink">{S.brief}</p>
              <p className="mt-2 text-xs text-muted">Lewy kciuk – ruch. Prawy – podanie albo strzał. Liczy się moment.</p>
              <button onClick={() => setP("play")} className="bw-grad mt-4 w-full rounded-2xl py-3.5 text-base font-medium text-white">Graj</button>
            </div>
          </div>
        )}
      </div>

      {result && (
        <Sheet title={result.verdict.verdict === "best" ? "Najlepszy wybór" : result.verdict.verdict === "good" ? "Dobrze, ale da się lepiej" : "Lepiej było inaczej"} onClose={() => reset.current()}>
          <TacticalBoard snap={result.snap} verdict={result.verdict} />
          <p className="mt-4 text-[15px] leading-snug">{result.verdict.summary}</p>
          <div className="mt-3 flex gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-ink" />Twój wybór</span>
            {result.verdict.verdict !== "best" && <span className="flex items-center gap-1.5"><span className="h-0 w-5 border-t-2 border-dashed border-club" />Lepsza opcja</span>}
          </div>
          <button onClick={() => reset.current()} className="bw-grad mt-5 w-full rounded-2xl py-4 text-base font-medium text-white">Jeszcze raz</button>
        </Sheet>
      )}
    </main>
  );
}

function ActionButton({ label, onTap }: { label: string; onTap: () => void }) {
  return (
    <button onPointerDown={onTap}
      className="flex h-16 w-16 items-center justify-center rounded-full bg-white/85 text-sm font-semibold text-ink shadow-lg shadow-black/10 backdrop-blur active:scale-90">
      {label}
    </button>
  );
}

function Joystick({ onChange }: { onChange: (x: number, y: number) => void }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const R = 42;
  const move = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    setKnob({ x: dx, y: dy }); onChange(dx / R, dy / R);
  };
  const end = () => { setKnob({ x: 0, y: 0 }); onChange(0, 0); };
  return (
    <div ref={base}
      className="absolute bottom-5 left-4 h-28 w-28 touch-none rounded-full border border-white/60 bg-white/30 backdrop-blur"
      onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); move(e); }}
      onPointerMove={(e) => { if (e.buttons) move(e); }}
      onPointerUp={end} onPointerCancel={end}>
      <div className="absolute left-1/2 top-1/2 h-12 w-12 rounded-full bg-white shadow-md transition-transform duration-75"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
    </div>
  );
}
