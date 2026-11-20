import { useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { Sheet } from "../Sheet";
import { ActorFactory, getActorAssets, type Actor } from "./actors";
import { BOOTS, BUILDS, DEFAULT_LOOK, HAIR_COLORS, HAIR_STYLES, HEIGHTS, SKINS, TEAM_COLORS, saveLook, type PlayerLook } from "./look";
import { kitFromLook } from "./lookKit";

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

/** Podgląd 3D zawodnika: stoi w miejscu, obraca się sam, a przeciągnięcie palcem obraca go ręcznie. */
function LookPreview({ look }: { look: PlayerLook }) {
  const mount = useRef<HTMLDivElement>(null);
  const lookRef = useRef(look);
  lookRef.current = look;
  const rebuild = useRef<() => void>(() => {});
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = mount.current!;
    let alive = true, raf = 0;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.NeutralToneMapping;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xdcebff, 0x5a8f5f, 1.1));
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    sun.position.set(3, 5, 4); scene.add(sun);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(0.95, 48), new THREE.MeshStandardMaterial({ color: 0x6cb878, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.005; scene.add(ground);
    const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    cam.position.set(0, 1.0, 4.7); cam.lookAt(0, 0.92, 0);
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(el);

    let actor: Actor | null = null, factory: ActorFactory | null = null;
    let spin = 0, dragging = false, lastX = 0;
    const build = () => {
      if (!factory) return;
      if (actor) scene.remove(actor.root);
      actor = factory.make(kitFromLook(lookRef.current), 3, "run");
      scene.add(actor.root);
    };
    rebuild.current = build;
    getActorAssets().then((assets) => { if (!alive) return; factory = new ActorFactory(assets); build(); setReady(true); }).catch(() => { if (alive) setFailed(true); });

    const down = (e: PointerEvent) => { dragging = true; lastX = e.clientX; (e.target as Element).setPointerCapture?.(e.pointerId); };
    const move = (e: PointerEvent) => { if (dragging) { spin += (e.clientX - lastX) * 0.012; lastX = e.clientX; } };
    const up = () => { dragging = false; };
    renderer.domElement.addEventListener("pointerdown", down); renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerup", up); renderer.domElement.addEventListener("pointercancel", up);
    renderer.domElement.style.touchAction = "none";

    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!dragging) spin += dt * 0.55;
      if (actor) { actor.update(0, dt, 0); actor.root.rotation.y = -Math.PI / 2 + spin; }
      renderer.render(scene, cam);
    };
    raf = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); rebuild.current = () => {}; renderer.dispose(); el.removeChild(renderer.domElement); };
  }, []);

  useEffect(() => { rebuild.current(); }, [look]);

  return (
    <div className="relative h-[300px] w-full overflow-hidden rounded-3xl bg-gradient-to-b from-[#cfe3f7] to-[#eaf3fb]">
      <div ref={mount} className="h-full w-full" />
      {!ready && !failed && <div className="bw-shimmer absolute inset-0 flex items-center justify-center text-sm text-muted">Ładuję podgląd…</div>}
      {failed && <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted">Podglądu nie udało się wczytać, ale wygląd i tak możesz zapisać.</div>}
      {ready && <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-white/70 px-3 py-0.5 text-[11px] text-muted backdrop-blur">Przeciągnij, żeby obrócić</span>}
    </div>
  );
}

function Row({ title, children }: { title: string; children: ReactNode }) {
  return <div className="mt-5"><div className="mb-2 text-xs uppercase tracking-wide text-muted">{title}</div>{children}</div>;
}
const chip = (on: boolean) => `rounded-full border px-3.5 py-2 text-sm ${on ? "bw-sel font-medium" : "border-hairline bg-canvas"}`;
function Swatches({ colors, value, onPick, label }: { colors: readonly number[]; value: number; onPick: (i: number) => void; label: (i: number) => string }) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {colors.map((c, i) => (
        <button key={i} onClick={() => onPick(i)} aria-label={label(i)} aria-pressed={value === i}
          className={`h-9 w-9 rounded-full border-2 transition active:scale-90 ${value === i ? "border-accent shadow-[0_0_0_2px_var(--color-accent-soft)]" : "border-white shadow-[0_0_0_1px_var(--color-hairline)]"}`} style={{ background: hex(c) }} />
      ))}
    </div>
  );
}

/** Kreator „Mój zawodnik”: wygląd i numer zapisują się lokalnie i obowiązują w IQ. */
export function LookEditor({ initial, onSave, onClose }: { initial: PlayerLook; onSave: (l: PlayerLook) => void; onClose: () => void }) {
  const [l, setL] = useState<PlayerLook>(initial);
  const set = (p: Partial<PlayerLook>) => setL((c) => ({ ...c, ...p }));
  const num = (v: number) => set({ number: Math.min(99, Math.max(1, Math.round(v) || 1)) });
  return (
    <Sheet title="Mój zawodnik" onClose={onClose}>
      <LookPreview look={l} />
      <Row title="Numer">
        <div className="flex items-center gap-3">
          <button onClick={() => num(l.number - 1)} aria-label="Mniejszy numer" className="h-11 w-11 rounded-full border border-hairline bg-canvas text-xl active:scale-90">−</button>
          <input value={l.number} onChange={(e) => num(Number(e.target.value.replace(/\D/g, "")))} inputMode="numeric" aria-label="Numer na koszulce" className="w-20 rounded-2xl border border-hairline bg-card px-3 py-2.5 text-center text-xl font-semibold tabular-nums outline-none focus:border-accent" />
          <button onClick={() => num(l.number + 1)} aria-label="Większy numer" className="h-11 w-11 rounded-full border border-hairline bg-canvas text-xl active:scale-90">+</button>
        </div>
      </Row>
      <Row title="Kolor stroju drużyny"><Swatches colors={TEAM_COLORS.map((t) => t.jersey)} value={l.teamColor} onPick={(i) => set({ teamColor: i })} label={(i) => TEAM_COLORS[i]!.name} /></Row>
      <Row title="Skóra"><Swatches colors={SKINS} value={l.skin} onPick={(i) => set({ skin: i })} label={(i) => `Odcień skóry ${i + 1}`} /></Row>
      <Row title="Fryzura"><div className="flex flex-wrap gap-2">{HAIR_STYLES.map((t, i) => <button key={t} onClick={() => set({ hairStyle: i })} className={chip(l.hairStyle === i)}>{t}</button>)}</div></Row>
      {l.hairStyle !== 5 && <Row title="Kolor włosów"><Swatches colors={HAIR_COLORS} value={l.hairColor} onPick={(i) => set({ hairColor: i })} label={(i) => `Kolor włosów ${i + 1}`} /></Row>}
      <Row title="Budowa"><div className="flex gap-2">{BUILDS.map(([t], i) => <button key={t} onClick={() => set({ build: i })} className={`flex-1 ${chip(l.build === i)}`}>{t}</button>)}</div></Row>
      <Row title="Wzrost"><div className="flex gap-2">{HEIGHTS.map(([t], i) => <button key={t} onClick={() => set({ height: i })} className={`flex-1 ${chip(l.height === i)}`}>{t}</button>)}</div></Row>
      <Row title="Buty"><Swatches colors={BOOTS} value={l.boots} onPick={(i) => set({ boots: i })} label={(i) => `Kolor butów ${i + 1}`} /></Row>
      <div className="mt-6 flex gap-2">
        <button onClick={() => { saveLook(l); onSave(l); }} className="bw-grad flex-1 rounded-2xl py-3.5 text-base font-medium">Zapisz</button>
        <button onClick={() => setL(DEFAULT_LOOK)} className="rounded-2xl border border-hairline bg-card px-4 py-3.5 text-sm text-muted">Domyślny</button>
      </div>
      <p className="mt-3 text-[11px] text-muted">Wygląd zapisuje się tylko na tym urządzeniu. Zmiana restartuje próbę (nowa, losowa sytuacja).</p>
    </Sheet>
  );
}
