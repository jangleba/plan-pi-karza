import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  SCENARIO_RUN_IN_BEHIND as S, compare, snapshotAt,
} from "./engine";
import type { Snapshot, Vec, Verdict } from "./engine";
import { TacticalBoard } from "./TacticalBoard";
import { PageHeader } from "./Sketch";

const SPEED = 6;
const FIELD = { w: 105, h: 68 };

interface Result { snap: Snapshot; verdict: Verdict }

function disc(color: number, r = 0.5, h = 1.7) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), new THREE.MeshLambertMaterial({ color }));
  m.position.y = h / 2;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

function pitchTexture() {
  const c = document.createElement("canvas");
  c.width = 1050; c.height = 680;
  const g = c.getContext("2d")!;
  g.fillStyle = "#7bc99a"; g.fillRect(0, 0, 1050, 680);
  for (let i = 0; i < 10; i++) { g.fillStyle = i % 2 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)"; g.fillRect(i * 105, 0, 105, 680); }
  g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = 4;
  g.strokeRect(5, 5, 1040, 670);
  g.beginPath(); g.moveTo(525, 5); g.lineTo(525, 675); g.stroke();
  g.strokeRect(1050 - 165, 138, 160, 403); g.strokeRect(5, 138, 160, 403);
  g.beginPath(); g.arc(525, 340, 91, 0, Math.PI * 2); g.stroke();
  return new THREE.CanvasTexture(c);
}

export default function IQ() {
  const mount = useRef<HTMLDivElement>(null);
  const joy = useRef({ x: 0, y: 0 });
  const act = useRef<"pass" | "shot" | null>(null);
  const reset = useRef<() => void>(() => {});
  const [result, setResult] = useState<Result | null>(null);
  const [fps, setFps] = useState(0);

  useEffect(() => {
    const el = mount.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe3edf8);
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x88aa88, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 0.6); sun.position.set(30, 60, 20); scene.add(sun);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.w, FIELD.h), new THREE.MeshLambertMaterial({ map: pitchTexture() }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(FIELD.w / 2, 0, FIELD.h / 2); scene.add(ground);
    const goal = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.4, 7.32), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    goal.position.set(105, 1.2, 34); scene.add(goal);

    const me = disc(0x2f5f9e); scene.add(me);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 12), new THREE.MeshLambertMaterial({ color: 0xffffff })); scene.add(ball);
    const mates = S.mates.map(() => { const g = disc(0x8fb3e8); scene.add(g); return g; });
    const defs = [...S.backLine, ...S.pressers].map(() => { const g = disc(0xe89494); scene.add(g); return g; });
    const gk = disc(0xf0cf6b); scene.add(gk);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.08, 8, 24), new THREE.MeshBasicMaterial({ color: 0xe8923a }));
    ring.rotation.x = Math.PI / 2; scene.add(ring);

    let player: Vec = { ...S.player };
    let facing: Vec = { x: 1, y: 0 };
    let t = 0;
    let frozen = false;
    const keys = new Set<string>();
    const onKey = (e: KeyboardEvent, down: boolean) => { if (down) keys.add(e.key.toLowerCase()); else keys.delete(e.key.toLowerCase()); };
    const kd = (e: KeyboardEvent) => onKey(e, true), ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(el);

    reset.current = () => { player = { ...S.player }; facing = { x: 1, y: 0 }; t = 0; frozen = false; act.current = null; setResult(null); };

    let last = performance.now(), frames = 0, acc = 0, raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      frames++; acc += dt; if (acc >= 1) { setFps(Math.round(frames / acc)); frames = 0; acc = 0; }

      let jx = joy.current.x, jy = joy.current.y;
      if (keys.has("w") || keys.has("arrowup")) jy -= 1;
      if (keys.has("s") || keys.has("arrowdown")) jy += 1;
      if (keys.has("a") || keys.has("arrowleft")) jx -= 1;
      if (keys.has("d") || keys.has("arrowright")) jx += 1;
      // joystick: góra = naprzód (+x), prawo = +y (w stronę „prawej" kamery)
      const mv = { x: -jy, y: jx };
      const mag = Math.min(1, Math.hypot(mv.x, mv.y));
      if (!frozen) {
        t += dt;
        if (mag > 0.05) {
          const n = { x: mv.x / Math.hypot(mv.x, mv.y), y: mv.y / Math.hypot(mv.x, mv.y) };
          facing = n;
          player = { x: Math.max(1, Math.min(104, player.x + n.x * SPEED * mag * dt)), y: Math.max(1, Math.min(67, player.y + n.y * SPEED * mag * dt)) };
        }
      }
      const snap = snapshotAt(S, t, player);

      // cel podania: kolega najbliższy kierunkowi zawodnika
      let aim: string | null = null, bestCos = 0.2;
      for (const m of snap.mates) {
        const dx = m.pos.x - player.x, dy = m.pos.y - player.y, d = Math.hypot(dx, dy) || 1;
        const cos = (dx * facing.x + dy * facing.y) / d;
        if (cos > bestCos) { bestCos = cos; aim = m.id; }
      }

      if (!frozen && act.current) {
        const a = act.current; act.current = null;
        const chosen = a === "shot" ? { kind: "shot" as const } : aim ? { kind: "pass" as const, targetId: aim } : null;
        if (chosen) {
          frozen = true;
          setResult({ snap, verdict: compare(snap, chosen) });
        }
      }

      me.position.set(player.x, 0, player.y);
      ball.position.set(player.x + facing.x * 0.8, 0.25, player.y + facing.y * 0.8);
      snap.mates.forEach((m, i) => mates[i]!.position.set(m.pos.x, 0, m.pos.y));
      snap.defenders.forEach((d, i) => defs[i]!.position.set(d.x, 0, d.y));
      gk.position.set(snap.keeper.x, 0, snap.keeper.y);
      const aimMate = snap.mates.find((m) => m.id === aim);
      ring.visible = !!aimMate && !frozen;
      if (aimMate) ring.position.set(aimMate.pos.x, 0.1, aimMate.pos.y);

      cam.position.set(player.x - 9, 5.5, player.y);
      cam.lookAt(player.x + 10, 0.5, player.y);
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
    <main className="mx-auto max-w-md px-4 pb-28 pt-14">
      <PageHeader kind="iq" title="IQ" sub={<>{S.title}. {S.brief}</>} />
      <div className="relative">
        <div ref={mount} className="h-[52vh] w-full overflow-hidden rounded-2xl bg-hairline" />
        <Joystick onChange={(x, y) => { joy.current = { x, y }; }} />
        <div className="absolute bottom-4 right-4 flex flex-col gap-2">
          <button onClick={() => { act.current = "pass"; }} className="rounded-full bg-white/90 px-5 py-3 text-sm font-medium shadow">Podanie</button>
          <button onClick={() => { act.current = "shot"; }} className="rounded-full bg-white/90 px-5 py-3 text-sm font-medium shadow">Strzał</button>
        </div>
        <span className="absolute left-3 top-3 rounded-full bg-white/80 px-2 py-0.5 text-[11px] text-muted">{fps} fps</span>
      </div>
      {result && (
        <section className="mt-4 rounded-2xl bg-card p-4 border border-hairline">
          <h2 className="mb-2 text-base font-semibold">Tablica taktyczna</h2>
          <TacticalBoard snap={result.snap} verdict={result.verdict} />
          <p className="mt-3 text-sm">{result.verdict.summary}</p>
          <button onClick={() => reset.current()} className="mt-3 w-full rounded-xl bg-accent py-2.5 text-sm font-medium text-white">Jeszcze raz</button>
        </section>
      )}
    </main>
  );
}

function Joystick({ onChange }: { onChange: (x: number, y: number) => void }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const R = 44;
  const move = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    setKnob({ x: dx, y: dy }); onChange(dx / R, dy / R);
  };
  return (
    <div
      ref={base}
      className="absolute bottom-4 left-4 h-28 w-28 touch-none rounded-full bg-white/50"
      onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); move(e); }}
      onPointerMove={(e) => { if (e.buttons) move(e); }}
      onPointerUp={() => { setKnob({ x: 0, y: 0 }); onChange(0, 0); }}
      onPointerCancel={() => { setKnob({ x: 0, y: 0 }); onChange(0, 0); }}
    >
      <div className="absolute left-1/2 top-1/2 h-12 w-12 rounded-full bg-white shadow" style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
    </div>
  );
}
