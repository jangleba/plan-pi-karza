import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GOAL, SCENARIO_RUN_IN_BEHIND as S, compare, snapshotAt } from "./engine";
import type { Snapshot, Vec, Verdict } from "./engine";
import { TacticalBoard } from "./TacticalBoard";
import { Sheet } from "./Sheet";
import { LargeTitle } from "./ui";
import { FIELD, headingOf, makeBall, makeGoal, pitchTexture, skyTexture } from "./iq/scene";
import { ActorFactory, loadActorAssets, type Actor, type ActorAssets } from "./iq/actors";
import { drive, followCamera, turnTo, type Drive } from "./iq/control";

const BALL_R = 0.16;
interface Result { snap: Snapshot; verdict: Verdict }
type Phase = "loading" | "intro" | "play" | "kick" | "flight" | "done";

const Y = new THREE.Vector3(0, 1, 0);

export default function IQ() {
  const mount = useRef<HTMLDivElement>(null);
  const joy = useRef({ x: 0, y: 0 });
  const act = useRef<"pass" | "shot" | null>(null);
  const phaseRef = useRef<Phase>("loading");
  const reset = useRef<() => void>(() => {});
  const [phase, setPhase] = useState<Phase>("loading");
  const [result, setResult] = useState<Result | null>(null);
  const [clock, setClock] = useState(0);
  const [aimName, setAimName] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);

  const setP = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  useEffect(() => {
    const el = mount.current!;
    let alive = true;
    let cleanup = () => {};

    (async () => {
      // postacie Mixamo (gładko oskórowane); gdy się nie wczytają – sylwetki proceduralne
      let assets: ActorAssets | null = null;
      try { assets = await loadActorAssets(); } catch { setFallback(true); }
      if (!alive) return;
      cleanup = start(assets);
      setP("intro");
    })();

    function start(assets: ActorAssets | null) {
      const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      // jakość startowa; obniżana automatycznie, jeśli telefon nie wyrabia 60 kl./s
      let dpr = Math.min(window.devicePixelRatio, 1.75);
      renderer.setPixelRatio(dpr);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      el.appendChild(renderer.domElement);
      if (import.meta.env.DEV) (window as unknown as { __iq?: THREE.WebGLRenderer }).__iq = renderer;

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

      const apron = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.w + 40, FIELD.h + 40), new THREE.MeshStandardMaterial({ color: 0x4f9a5c, roughness: 1 }));
      apron.rotation.x = -Math.PI / 2; apron.position.set(FIELD.w / 2, -0.01, FIELD.h / 2); apron.receiveShadow = true; scene.add(apron);
      const pitch = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.w, FIELD.h), new THREE.MeshStandardMaterial({ map: pitchTexture(), roughness: 0.95 }));
      pitch.rotation.x = -Math.PI / 2; pitch.position.set(FIELD.w / 2, 0, FIELD.h / 2); pitch.receiveShadow = true; scene.add(pitch);
      scene.add(makeGoal(FIELD.w, 1), makeGoal(0, -1));

      // jedna drużyna – jeden strój (Ty: pierścień pod stopami i numer 8)
      const factory = new ActorFactory(assets);
      const home = { jersey: 0x2f6fb3, shorts: 0xffffff, socks: 0x2f6fb3, collar: 0xffffff };
      const away = { jersey: 0xc8443f, shorts: 0x1d1d1f, socks: 0xc8443f, collar: 0x1d1d1f };
      const me = factory.make({ ...home, number: 8 }, 0);
      const mateNumbers = [9, 11, 6];
      const mates = S.mates.map((_, i) => factory.make({ ...home, number: mateNumbers[i] ?? 10 + i }, i + 1));
      const defs = [...S.backLine, ...S.pressers].map((_, i) => factory.make({ ...away, number: [2, 4, 5, 3, 6, 8][i] ?? 14 }, i + 2, "defend"));
      const gk = factory.make({ jersey: 0xe0b23a, shorts: 0x1d1d1f, socks: 0x1d1d1f, collar: 0x1d1d1f, number: 1, keeper: true, gloves: 0xe9eef3 }, 3, "keeper");
      for (const a of [me, ...mates, ...defs, gk]) scene.add(a.root);
      const ball = makeBall(); scene.add(ball);

      // celowanie: pierścień pod adresatem i przerywana linia
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; scene.add(ring);
      const aimLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
        new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.6, gapSize: 0.4, transparent: true, opacity: 0.85 }));
      scene.add(aimLine);
      const meMarker = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 32), new THREE.MeshBasicMaterial({ color: 0x8ec1f0, side: THREE.DoubleSide }));
      meMarker.rotation.x = -Math.PI / 2; scene.add(meMarker);

      // sterowanie jak w samochodzie: kierunek zawodnika + kamera, która go płynnie dogania
      const dr: Drive = { x: S.player.x, y: S.player.y, heading: 0, speed: 0, cam: 0 };
      let player: Vec = { x: dr.x, y: dr.y };
      let facing: Vec = { x: 1, y: 0 };
      let t = 0;
      const prev = new Map<Actor, Vec>();
      // kopnięcie: zamach → kontakt (piłka opuszcza stopę) → lot
      let kickSt: { elapsed: number; contactIn: number; spotW: THREE.Vector3; startW: THREE.Vector3; to: Vec; a: "pass" | "shot"; yaw: number; verdict: Verdict; snap: Snapshot } | null = null;
      let flight: { from: THREE.Vector3; to: Vec; k: number; dur: number; lift: number; done: () => void } | null = null;
      const keys = new Set<string>();
      const kd = (e: KeyboardEvent) => keys.add(e.key.toLowerCase());
      const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
      window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);

      const camPos = new THREE.Vector3(player.x - 8, 4.3, player.y);
      const camLook = new THREE.Vector3(player.x + 10, 0.9, player.y);
      const target = new THREE.Vector3(), look = new THREE.Vector3();
      const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
      resize();
      const ro = new ResizeObserver(resize); ro.observe(el);

      // prowadzenie piłki: dotknięcie co ok. 1,8 m drogi, piłka płynnie dąży do pozycji, obraca się o dystans / promień
      let carried = 0;
      const ballTarget = new THREE.Vector3(), q = new THREE.Quaternion(), axis = new THREE.Vector3();
      const spinBall = (dx: number, dz: number, dist: number) => {
        if (dist < 1e-5) return;
        axis.set(dz, 0, -dx).normalize();
        q.setFromAxisAngle(axis, dist / BALL_R);
        ball.quaternion.premultiply(q);
      };

      reset.current = () => {
        dr.x = S.player.x; dr.y = S.player.y; dr.heading = 0; dr.speed = 0; dr.cam = 0;
        player = { x: dr.x, y: dr.y }; facing = { x: 1, y: 0 }; t = 0; flight = null; kickSt = null; act.current = null; carried = 0;
        me.root.rotation.y = 0;
        ball.position.set(player.x + 0.7, BALL_R, player.y);
        setResult(null); setClock(0); setP("intro");
      };

      const place = (a: Actor, p: Vec, dt: number, faceTo?: Vec) => {
        const old = prev.get(a) ?? p;
        const v = Math.hypot(p.x - old.x, p.y - old.y) / Math.max(dt, 1e-3);
        const dir = v > 0.3 ? headingOf(p.x - old.x, p.y - old.y) : faceTo ? headingOf(faceTo.x - p.x, faceTo.y - p.y) : a.root.rotation.y;
        a.root.position.set(p.x, 0, p.y);
        a.update(v, dt, dir);
        prev.set(a, { ...p });
      };

      let last = performance.now(), raf = 0, clockAcc = 0;
      let lastAim: string | null = null;
      let perfFrames = 0, perfTime = 0, perfStep = 0;
      ball.position.set(player.x + 0.7, BALL_R, player.y);

      const tick = (now: number, raw: number) => {
        const dt = Math.min(0.05, raw);
        if (document.hidden) return;
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
        jx = Math.max(-1, Math.min(1, jx)); jy = Math.max(-1, Math.min(1, jy));
        const stick = { r: jx, f: -jy };

        // świat żyje podczas zamachu i lotu piłki (koledzy biegną, obrońcy doskakują); stoi tylko w intro i po wyniku
        if (ph === "play" || ph === "kick" || ph === "flight") t += dt;
        let moved = 0;
        if (ph === "play") {
          clockAcc += dt; if (clockAcc > 0.1) { clockAcc = 0; setClock(t); }
          moved = drive(dr, stick, dt, { minX: 1, maxX: 104, minY: 1, maxY: 67 });
        } else if (ph === "kick" && kickSt) {
          turnTo(dr, Math.atan2(kickSt.to.y - dr.y, kickSt.to.x - dr.x), dt); // staje do celu przed zamachem
        } else {
          followCamera(dr, dt);
        }
        player = { x: dr.x, y: dr.y };
        facing = { x: Math.cos(dr.heading), y: Math.sin(dr.heading) };

        const snap = snapshotAt(S, t, player);

        // adresat podania: kolega najbliżej kierunku zawodnika
        let aim: string | null = null, bestCos = 0.2;
        for (const m of snap.mates) {
          const dx = m.pos.x - player.x, dy = m.pos.y - player.y, d = Math.hypot(dx, dy) || 1;
          const cos = (dx * facing.x + dy * facing.y) / d;
          if (cos > bestCos) { bestCos = cos; aim = m.id; }
        }
        const aimMate = snap.mates.find((m) => m.id === aim);

        // naciśnięcie „Podaj”/„Strzał”: decyzja jest oceniana w tej chwili; zawodnik staje do celu i wykonuje zamach
        if (ph === "play" && act.current) {
          const a = act.current; act.current = null;
          const chosen = a === "shot" ? { kind: "shot" as const } : aimMate ? { kind: "pass" as const, targetId: aimMate.id } : null;
          if (chosen) {
            const to = a === "shot" ? { x: GOAL.x + 0.5, y: GOAL.y + (player.y > GOAL.y ? -2.4 : 2.4) } : aimMate!.pos;
            const yaw = headingOf(to.x - player.x, to.y - player.y);
            const k = me.kick();
            const spotW = k.spot.clone().applyAxisAngle(Y, yaw).add(new THREE.Vector3(player.x, 0, player.y));
            kickSt = { elapsed: 0, contactIn: k.contactIn, spotW, startW: ball.position.clone(), to, a, yaw, verdict: compare(snap, chosen), snap };
            setP("kick");
          }
        }

        if (kickSt) { me.root.position.set(player.x, 0, player.y); me.update(0, dt, kickSt.yaw); } // zamach: stoi i obraca się do celu
        else {
          me.root.position.set(player.x, 0, player.y);
          me.update(dr.speed, dt, -dr.heading); // aktor: obrót wokół Y = −kierunek w układzie boiska
          prev.set(me, { ...player });
        }
        snap.mates.forEach((m, i) => place(mates[i]!, m.pos, dt, player));
        snap.defenders.forEach((d, i) => place(defs[i]!, d, dt, player));
        place(gk, snap.keeper, dt, player);
        meMarker.position.set(player.x, 0.02, player.y);

        if (ph === "kick" && kickSt) {
          kickSt.elapsed += dt;
          // piłka podtoczona na miejsce kontaktu (pierwsze 0,18 s), potem leży do chwili uderzenia
          const k = Math.min(1, kickSt.elapsed / 0.18), e = k * k * (3 - 2 * k);
          ball.position.lerpVectors(kickSt.startW, kickSt.spotW, e);
          ball.position.y = BALL_R;
          if (kickSt.elapsed >= kickSt.contactIn) {
            // kontakt: piłka startuje z miejsca stopy
            const d = Math.hypot(kickSt.to.x - ball.position.x, kickSt.to.y - ball.position.z);
            const { verdict, snap: s } = kickSt, a = kickSt.a;
            flight = {
              from: ball.position.clone(), to: kickSt.to, k: 0, dur: Math.min(1.4, d / (a === "shot" ? 28 : 20)), lift: a === "shot" ? 1.4 : 0.5,
              done: () => { setResult({ snap: s, verdict }); setP("done"); },
            };
            kickSt = null;
            setP("flight");
          }
        } else if (ph === "flight" && flight) {
          flight.k = Math.min(1, flight.k + dt / flight.dur);
          const k = flight.k;
          const px = ball.position.x, pz = ball.position.z;
          ball.position.set(flight.from.x + (flight.to.x - flight.from.x) * k, BALL_R + Math.sin(Math.PI * k) * flight.lift, flight.from.z + (flight.to.y - flight.from.z) * k);
          spinBall(ball.position.x - px, ball.position.z - pz, Math.hypot(ball.position.x - px, ball.position.z - pz) * 1.2);
          if (k >= 1) { const done = flight.done; flight = null; done(); }
        } else if (ph !== "done") {
          // prowadzenie: dotknięcie co ok. 1,8 m, piłka za dotknięciem „odbiega” i wraca przy stopie
          carried += moved;
          const touch = (carried % 1.8) / 1.8;
          const ahead = 0.62 + 0.42 * Math.sin(Math.PI * touch);
          ballTarget.set(player.x + facing.x * ahead - facing.y * 0.1, BALL_R, player.y + facing.y * ahead + facing.x * 0.1);
          const px = ball.position.x, pz = ball.position.z;
          ball.position.lerp(ballTarget, 1 - Math.exp(-dt * 14));
          ball.position.y = BALL_R;
          spinBall(ball.position.x - px, ball.position.z - pz, Math.hypot(ball.position.x - px, ball.position.z - pz));
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
        const aimNow = showAim ? aimMate!.name : null;
        if (aimNow !== lastAim) { lastAim = aimNow; setAimName(aimNow); }

        // kamera za plecami zawodnika, obraca się razem z nim (kierunek dogania płynnie w sterowaniu)
        const cx = Math.cos(dr.cam), cy = Math.sin(dr.cam);
        target.set(player.x - 8 * cx, 4.3, player.y - 8 * cy);
        look.set(player.x + 12 * cx, 0.9, player.y + 12 * cy);
        camPos.lerp(target, 1 - Math.exp(-dt * 18)); camLook.lerp(look, 1 - Math.exp(-dt * 18));
        cam.position.copy(camPos); cam.lookAt(camLook);
        sun.position.set(player.x - 15, 40, player.y + 20); sun.target.position.set(player.x + 8, 0, player.y);
        renderer.render(scene, cam);
      };
      let manual = false;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const raw = (now - last) / 1000; last = now;
        if (!manual) tick(now, raw);
      };
      raf = requestAnimationFrame(loop);
      // tylko tryb deweloperski: krokowanie symulacji stałym krokiem (testy kopnięcia klatka po klatce)
      if (import.meta.env.DEV) {
        (window as unknown as { __iqDebug?: unknown }).__iqDebug = {
          manual: (b: boolean) => { manual = b; },
          advance: (n: number, dt: number) => { for (let i = 0; i < n; i++) tick(performance.now(), dt); },
          press: (a: "pass" | "shot") => { act.current = a; },
          stick: (r: number, f: number) => { joy.current = { x: r, y: -f }; },
          state: () => ({ heading: dr.heading, cam: dr.cam, speed: dr.speed, x: dr.x, y: dr.y }),
        };
      }

      return () => {
        cancelAnimationFrame(raf); ro.disconnect();
        window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku);
        renderer.dispose(); el.removeChild(renderer.domElement);
      };
    }

    return () => { alive = false; cleanup(); };
  }, []);

  return (
    <main className="mx-auto max-w-md px-5 pb-28 pt-14">
      <LargeTitle kind="iq" title="IQ" sub={S.title} />
      <div className="relative overflow-hidden rounded-3xl border border-hairline bg-hairline shadow-sm">
        <div ref={mount} className="h-[58vh] min-h-[340px] w-full" />

        {phase === "loading" && (
          <div className="bw-shimmer absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-white/85 px-4 py-2 text-sm text-muted backdrop-blur">Ładuję zawodników…</span>
          </div>
        )}

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
              <p className="mt-2 text-xs text-muted">Joystick: do przodu – bieg, w bok – skręt (kamera obraca się za Tobą). Patrz w stronę kolegi i podaj.</p>
              {fallback && <p className="mt-2 text-xs text-muted">Uproszczone postacie (nie udało się wczytać modeli).</p>}
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
