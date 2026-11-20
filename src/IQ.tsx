import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GOAL, localISO } from "./engine";
import type { Vec } from "./engine";
import { VARIANTS, classify, coachSteps, firstAction, freshSeed, randomScenario, firstLoss, pass, rateOptions, record, setUser, shoot, snapshotAtOrBefore, startRecording, step } from "./engine/sim";
import type { Recording, Variant, World } from "./engine/sim";
import { addAttempt } from "./iq/attempts-store";
import { ResultSheet, type ResultBundle } from "./iq/ResultSheet";
import { LargeTitle } from "./ui";
import { BALL_VISUAL_R, FIELD, FOG_COLOR, headingOf, makeBall, dashTexture, makeBallShadow, makeGoal, makePitch, makeStadium, skyTexture } from "./iq/scene";
import { ActorFactory, getActorAssets, type Actor, type ActorAssets } from "./iq/actors";
import { LookEditor } from "./iq/LookEditor";
import { TEAM_COLORS, loadLook, opponentKit, type PlayerLook } from "./iq/look";
import { kitFromLook } from "./iq/lookKit";
import { drive, followCamera, turnTo, type Drive } from "./iq/control";

const BALL_R = BALL_VISUAL_R;
const CAM = { back: 6.8, up: 3.4, ahead: 11, lookY: 1.0 };
const FOV_BASE = 56, FOV_RUN = 61; // pole widzenia rośnie z prędkością (wrażenie tempa)
/** Stopnie rozdzielczości renderowania (pixel ratio): start od najwyższego, spadek przy braku płynności, powrót gdy jest zapas. */
const DPR_TIERS = [2, 1.5, 1.25, 1];
type Result = ResultBundle;
type Phase = "loading" | "intro" | "play" | "kick" | "done";
type Possession = "me" | "mate" | "foe" | "loose";

const Y = new THREE.Vector3(0, 1, 0);

export default function IQ() {
  const mount = useRef<HTMLDivElement>(null);
  const joy = useRef({ x: 0, y: 0 });
  const arrow = useRef<HTMLDivElement>(null);
  const act = useRef<"pass" | "shot" | null>(null);
  const phaseRef = useRef<Phase>("loading");
  const reset = useRef<(next: boolean) => void>(() => {});
  const attempt = useRef(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [result, setResult] = useState<Result | null>(null);
  const [clock, setClock] = useState(0);
  const [aimName, setAimName] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const [variant, setVariant] = useState<Variant>(0);
  const [myLook, setMyLook] = useState<PlayerLook>(loadLook);
  const [editor, setEditor] = useState(false);
  const [poss, setPoss] = useState<Possession>("me");

  const setP = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  useEffect(() => {
    const el = mount.current!;
    let alive = true;
    let cleanup = () => {};

    (async () => {
      // postacie Mixamo (gładko oskórowane); gdy się nie wczytają – sylwetki proceduralne
      let assets: ActorAssets | null = null;
      try { assets = await getActorAssets(); } catch { setFallback(true); }
      if (!alive) return;
      cleanup = start(assets);
      setP("intro");
    })();

    function start(assets: ActorAssets | null) {
      const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      // rozdzielczość: start od najwyższego stopnia dostępnego na tym ekranie (maks. 2×), potem adaptacja do wydajności telefonu
      let tier = Math.max(0, DPR_TIERS.findIndex((t) => t <= window.devicePixelRatio + 1e-6));
      let dpr = DPR_TIERS[tier]!;
      renderer.setPixelRatio(dpr);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      // neutralne mapowanie tonów: zachowuje barwy strojów, białą piłkę i linie (ACES przygaszał biel i wyszarzał kolory)
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.toneMappingExposure = 1.15;
      el.appendChild(renderer.domElement);
      if (import.meta.env.DEV) (window as unknown as { __iq?: THREE.WebGLRenderer }).__iq = renderer;

      const scene = new THREE.Scene();
      scene.background = skyTexture();
      scene.fog = new THREE.Fog(FOG_COLOR, 110, 280);
      const cam = new THREE.PerspectiveCamera(FOV_BASE, 1, 0.1, 400);

      // światło: mniej „płaskiego” rozproszenia, wyraźniejsze słońce (kontrast brył i cieni), ciepły odcień słońca
      scene.add(new THREE.HemisphereLight(0xdcebff, 0x5a8f5f, 1.0));
      const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048); // ±22 m → ok. 2 cm na teksel (było 4 cm)
      Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 120 });
      sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03;
      scene.add(sun, sun.target);

      scene.add(makePitch(renderer.capabilities.getMaxAnisotropy()));
      scene.add(makeGoal(FIELD.w, 1), makeGoal(0, -1));
      scene.add(makeStadium());

      // symulacja: 17 żywych zawodników (nasza drużyna z Tobą + rywale z bramkarzami)
      // każda sytuacja jest nowa i losowa (ziarno z losowania); „Jeszcze raz” odtwarza tę samą po ziarnie
      let scen = randomScenario(freshSeed());
      let world: World = scen.world;
      setVariant(scen.variant);
      let rec: Recording = startRecording(world);
      const P0 = world.agents.find((a) => a.id === "P")!;

      const factory = new ActorFactory(assets);
      // stroje: nasz kolor z wyglądu zawodnika, rywale w kolorze kontrastowym; bramkarze w kolorach różnych od pól
      const home = TEAM_COLORS[myLook.teamColor]!, away = opponentKit(myLook.teamColor);
      const gkUs = [0xe0b23a, 0x8a95a5].find((c) => c !== home.jersey)!, gkThem = [0x4a9a63, 0xd9a23a, 0x6a5acd].find((c) => c !== home.jersey && c !== gkUs && c !== away.jersey)!;
      const keeperKit = (jersey: number) => ({ jersey, shorts: 0x1d1d1f, socks: 0x1d1d1f, collar: 0x1d1d1f, keeper: true, gloves: 0xe9eef3 });
      const actors = new Map<string, Actor>();
      world.agents.forEach((a, i) => {
        const gkp = a.role === "GK";
        const kit = a.id === "P" ? kitFromLook(myLook)
          : gkp ? { ...keeperKit(a.team === "us" ? gkUs : gkThem), number: a.number }
          : { jersey: (a.team === "us" ? home : away).jersey, shorts: (a.team === "us" ? home : away).shorts, socks: (a.team === "us" ? home : away).socks, collar: (a.team === "us" ? home : away).collar, number: a.number };
        const actor = factory.make(kit, i, gkp ? "keeper" : a.team === "them" ? "defend" : "run");
        actors.set(a.id, actor); scene.add(actor.root);
      });
      const me = actors.get("P")!;
      const ball = makeBall(); scene.add(ball);
      const ballShadow = makeBallShadow(); scene.add(ballShadow);

      // celowanie: pierścień pod adresatem i przerywana linia
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; scene.add(ring);
      // linia celowania jako wstęga z przerywaną teksturą (linie WebGL mają 1 piksel, więc na telefonie prawie ich nie widać)
      const aimTex = dashTexture();
      const aimLine = new THREE.Group();
      const aimRibbon = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.15), new THREE.MeshBasicMaterial({ map: aimTex, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -10 }));
      aimRibbon.rotation.x = -Math.PI / 2; aimLine.add(aimRibbon);
      scene.add(aimLine);
      const foeRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.78, 32), new THREE.MeshBasicMaterial({ color: 0xe0554f, transparent: true, opacity: 0.95, side: THREE.DoubleSide }));
      foeRing.rotation.x = -Math.PI / 2; foeRing.visible = false; scene.add(foeRing);
      const meMarker = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 32), new THREE.MeshBasicMaterial({ color: 0x8ec1f0, side: THREE.DoubleSide }));
      meMarker.rotation.x = -Math.PI / 2; scene.add(meMarker);

      // sterowanie jak w samochodzie: kierunek zawodnika + kamera, która go płynnie dogania
      const dr: Drive = { x: P0.pos.x, y: P0.pos.y, heading: 0, speed: 0, cam: 0 };
      let player: Vec = { x: dr.x, y: dr.y };
      let facing: Vec = { x: 1, y: 0 };
      const prev = new Map<Actor, Vec>();
      // kopnięcie: zamach → kontakt (piłka opuszcza stopę, świat dostaje podanie/strzał)
      let kickSt: { elapsed: number; contactIn: number; spotW: THREE.Vector3; startW: THREE.Vector3; to: Vec; a: "pass" | "shot"; yaw: number; targetId: string | null } | null = null;
      let outcomeT = 0;
      const keys = new Set<string>();
      const kd = (e: KeyboardEvent) => keys.add(e.key.toLowerCase());
      const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
      window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);

      const camPos = new THREE.Vector3(player.x - CAM.back, CAM.up, player.y);
      const camLook = new THREE.Vector3(player.x + CAM.ahead, CAM.lookY, player.y);
      const target = new THREE.Vector3(), look = new THREE.Vector3();
      const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
      resize();
      const ro = new ResizeObserver(resize); ro.observe(el);

      // piłka: prowadzona (dotknięcie co ok. 1,8 m), niesiona przez innych, w locie albo luźna; obraca się o dystans / promień
      let carried = 0;
      const ballTarget = new THREE.Vector3(), q = new THREE.Quaternion(), axis = new THREE.Vector3();
      const spinBall = (dx: number, dz: number, dist: number) => {
        if (dist < 1e-5) return;
        axis.set(dz, 0, -dx).normalize();
        q.setFromAxisAngle(axis, dist / BALL_R);
        ball.quaternion.premultiply(q);
      };
      const putActors = () => {
        for (const a of world.agents) {
          const ac = actors.get(a.id)!;
          ac.root.position.set(a.pos.x, 0, a.pos.y);
          ac.root.rotation.y = -a.heading;
          prev.set(ac, { ...a.pos });
        }
      };

      reset.current = (next: boolean) => {
        if (next) attempt.current++;
        scen = next ? randomScenario(freshSeed(), scen.variant) : randomScenario(scen.seed);
        const v = scen.variant;
        world = scen.world;
        rec = startRecording(world);
        const p = world.agents.find((a) => a.id === "P")!;
        dr.x = p.pos.x; dr.y = p.pos.y; dr.heading = 0; dr.speed = 0; dr.cam = 0;
        player = { x: dr.x, y: dr.y }; facing = { x: 1, y: 0 }; kickSt = null; act.current = null; carried = 0; outcomeT = 0;
        putActors();
        ball.position.set(player.x + 0.7, BALL_R, player.y);
        setResult(null); setClock(0); setVariant(v); setPoss("me"); setP("intro");
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
      let lastAim: string | null = null, lastPoss: Possession = "me";
      let perfFrames = 0, perfTime = 0, warm = 0, good = 0, ups = 0;
      putActors();
      ball.position.set(player.x + 0.7, BALL_R, player.y);

      const tick = (now: number, raw: number) => {
        const dt = Math.min(0.05, raw);
        if (document.hidden) return;
        // adaptacja jakości: pierwsze klatki (kompilacja shaderów) pomijamy; przy braku płynności obniżamy rozdzielczość o jeden stopień
        // (zamiast skoku od razu do 1×, który rozmywał obraz), a przy dużym zapasie wracamy stopień wyżej (maks. 2 razy, bez „pompowania”)
        if (warm < 45) warm++;
        else if (!(import.meta.env.DEV && (window as unknown as { __noPerf?: boolean }).__noPerf)) {
          perfFrames++; perfTime += raw;
          if (perfFrames >= 60) {
            const avg = perfTime / perfFrames;
            const setTier = (t: number) => { tier = t; dpr = DPR_TIERS[t]!; renderer.setPixelRatio(dpr); resize(); };
            if (avg > 0.021 && tier < DPR_TIERS.length - 1) { setTier(tier + 1); good = 0; }
            else if (avg > 0.026 && tier === DPR_TIERS.length - 1 && sun.castShadow) { sun.castShadow = false; }
            else if (avg < 0.0125 && tier > 0 && ups < 2) { if (++good >= 5) { setTier(tier - 1); ups++; good = 0; } }
            else if (avg >= 0.0125) good = 0;
            perfFrames = 0; perfTime = 0;
          }
        }
        const ph = phaseRef.current;
        const live = (ph === "play" || ph === "kick") && !world.outcome;

        let jx = joy.current.x, jy = joy.current.y;
        if (keys.has("w") || keys.has("arrowup")) jy -= 1;
        if (keys.has("s") || keys.has("arrowdown")) jy += 1;
        if (keys.has("a") || keys.has("arrowleft")) jx -= 1;
        if (keys.has("d") || keys.has("arrowright")) jx += 1;
        jx = Math.max(-1, Math.min(1, jx)); jy = Math.max(-1, Math.min(1, jy));
        const stick = { r: jx, f: -jy };

        let moved = 0;
        if (live && ph === "play") moved = drive(dr, stick, dt, { minX: 1, maxX: 104, minY: 1, maxY: 67 });
        else if (live && ph === "kick" && kickSt) turnTo(dr, Math.atan2(kickSt.to.y - dr.y, kickSt.to.x - dr.x), dt); // staje do celu przed zamachem
        else followCamera(dr, dt);
        player = { x: dr.x, y: dr.y };
        facing = { x: Math.cos(dr.heading), y: Math.sin(dr.heading) };

        // świat żyje także podczas zamachu i lotu piłki; stoi w intro i po rozstrzygnięciu
        if (live) {
          const n = Math.ceil(dt / (1 / 30));
          for (let i = 0; i < n; i++) { setUser(world, player, dr.heading, dr.speed); step(world, dt / n); record(rec, world); }
          clockAcc += dt; if (clockAcc > 0.1) { clockAcc = 0; setClock(world.t); }
        }
        const agentOf = (id: string) => world.agents.find((a) => a.id === id)!;
        const mine = world.ball.owner === "P";

        // adresat podania: kolega najbliżej kierunku zawodnika
        let aim: string | null = null, bestCos = 0.2;
        for (const m of world.agents) {
          if (m.team !== "us" || m.id === "P" || m.role === "GK") continue;
          const dx = m.pos.x - player.x, dy = m.pos.y - player.y, d = Math.hypot(dx, dy) || 1;
          const cos = (dx * facing.x + dy * facing.y) / d;
          if (cos > bestCos) { bestCos = cos; aim = m.id; }
        }
        const aimMate = aim ? agentOf(aim) : null;

        // „Podaj”/„Strzał”: zawodnik staje do celu i wykonuje zamach; piłka rusza dopiero w chwili kontaktu ze stopą
        if (ph === "play" && live && act.current) {
          const a = act.current; act.current = null;
          if (mine && (a === "shot" || aimMate)) {
            const to = a === "shot" ? { x: GOAL.x + 0.5, y: GOAL.y + (player.y > GOAL.y ? -2.4 : 2.4) } : aimMate!.pos;
            const yaw = headingOf(to.x - player.x, to.y - player.y);
            const k = me.kick();
            const spotW = k.spot.clone().applyAxisAngle(Y, yaw).add(new THREE.Vector3(player.x, 0, player.y));
            kickSt = { elapsed: 0, contactIn: k.contactIn, spotW, startW: ball.position.clone(), to, a, yaw, targetId: a === "pass" ? aimMate!.id : null };
            setP("kick");
          }
        }
        // stracona piłka w zamachu: akcja anulowana
        if (kickSt && !mine) { kickSt = null; setP("play"); }

        if (kickSt) { me.root.position.set(player.x, 0, player.y); me.update(0, dt, kickSt.yaw); } // zamach: stoi i obraca się do celu
        else {
          me.root.position.set(player.x, 0, player.y);
          me.update(dr.speed, dt, -dr.heading); // aktor: obrót wokół Y = −kierunek w układzie boiska
          prev.set(me, { ...player });
        }
        for (const a of world.agents) {
          if (a.id === "P") continue;
          place(actors.get(a.id)!, a.pos, dt, world.ball.pos);
        }
        meMarker.position.set(player.x, 0.02, player.y);

        // piłka
        const px = ball.position.x, pz = ball.position.z;
        const fl = world.ball.flight;
        if (ph === "kick" && kickSt) {
          kickSt.elapsed += dt;
          // piłka podtoczona na miejsce kontaktu (pierwsze 0,18 s), potem leży do chwili uderzenia
          const k = Math.min(1, kickSt.elapsed / 0.18), e = k * k * (3 - 2 * k);
          ball.position.lerpVectors(kickSt.startW, kickSt.spotW, e);
          ball.position.y = BALL_R;
          if (kickSt.elapsed >= kickSt.contactIn) {
            const spot = { x: kickSt.spotW.x, y: kickSt.spotW.z };
            if (kickSt.a === "shot") shoot(world, "P", spot); else pass(world, "P", kickSt.targetId!, spot);
            kickSt = null;
            setP("play");
          }
          spinBall(ball.position.x - px, ball.position.z - pz, Math.hypot(ball.position.x - px, ball.position.z - pz));
        } else if (fl) {
          const k = Math.min(1, fl.t / fl.dur);
          ball.position.set(world.ball.pos.x, BALL_R + Math.sin(Math.PI * k) * (fl.kind === "shot" ? 1.4 : 0.5), world.ball.pos.y);
          spinBall(ball.position.x - px, ball.position.z - pz, Math.hypot(ball.position.x - px, ball.position.z - pz) * 1.2);
        } else if (mine && ph !== "done") {
          // prowadzenie: dotknięcie co ok. 1,8 m, piłka za dotknięciem „odbiega” i wraca przy stopie
          carried += moved;
          const touch = (carried % 1.8) / 1.8;
          const ahead = 0.62 + 0.42 * Math.sin(Math.PI * touch);
          ballTarget.set(player.x + facing.x * ahead - facing.y * 0.1, BALL_R, player.y + facing.y * ahead + facing.x * 0.1);
          ball.position.lerp(ballTarget, 1 - Math.exp(-dt * 14));
          ball.position.y = BALL_R;
          spinBall(ball.position.x - px, ball.position.z - pz, Math.hypot(ball.position.x - px, ball.position.z - pz));
        } else {
          // piłka u kolegi/rywala albo luźna: podąża za pozycją ze świata
          ballTarget.set(world.ball.pos.x, BALL_R, world.ball.pos.y);
          ball.position.lerp(ballTarget, 1 - Math.exp(-dt * 16));
          ball.position.y = BALL_R;
          spinBall(ball.position.x - px, ball.position.z - pz, Math.hypot(ball.position.x - px, ball.position.z - pz));
        }

        const showAim = !!aimMate && ph === "play" && mine;
        ring.visible = showAim; aimLine.visible = showAim;
        if (aimMate) {
          const pulse = 1 + Math.sin(now / 180) * 0.08;
          ring.position.set(aimMate.pos.x, 0.03, aimMate.pos.y); ring.scale.setScalar(pulse);
          // wstęga zaczyna się 1,1 m przed zawodnikiem i kończy 1,1 m przed pierścieniem adresata (bez białego klina pod stopami)
          const dx = aimMate.pos.x - player.x, dz = aimMate.pos.y - player.y, full = Math.hypot(dx, dz) || 1;
          const len = Math.max(0, full - 2.2), mid = 1.1 + len / 2;
          aimLine.visible = showAim && len > 0.5;
          aimLine.position.set(player.x + (dx / full) * mid, 0.035, player.y + (dz / full) * mid); aimLine.rotation.y = -Math.atan2(dz, dx);
          aimRibbon.scale.x = len; aimTex.repeat.x = len / 1.0;
        }
        const aimNow = showAim ? aimMate!.name : null;
        if (aimNow !== lastAim) { lastAim = aimNow; setAimName(aimNow); }

        const o = world.ball.owner ? agentOf(world.ball.owner) : null;
        const pNow: Possession = mine ? "me" : o ? (o.team === "us" ? "mate" : "foe") : fl ? (agentOf(fl.by).team === "us" ? "mate" : "foe") : "loose";
        // wskazówki odzyskiwania: czerwony pierścień pod rywalem z piłką i strzałka, gdzie jest piłka względem kamery
        const chase = !world.outcome && (pNow === "foe" || pNow === "loose");
        const bp = o ? o.pos : world.ball.pos;
        foeRing.visible = !!o && o.team === "them" && !world.outcome;
        if (foeRing.visible) { foeRing.position.set(bp.x, 0.03, bp.y); foeRing.scale.setScalar(1 + Math.sin(now / 160) * 0.1); }
        if (arrow.current) {
          const phi = Math.atan2(Math.sin(Math.atan2(bp.y - player.y, bp.x - player.x) - dr.cam), Math.cos(Math.atan2(bp.y - player.y, bp.x - player.x) - dr.cam));
          const far = Math.hypot(bp.x - player.x, bp.y - player.y) > 5 || Math.abs(phi) > 0.6;
          arrow.current.style.opacity = chase && far ? "1" : "0";
          arrow.current.style.transform = `rotate(${phi}rad)`;
        }
        if (pNow !== lastPoss) { lastPoss = pNow; setPoss(pNow); }

        // koniec akcji: chwila na zobaczenie gola/obrony/odbioru, potem podsumowanie
        if (world.outcome && ph !== "done" && ph !== "intro") {
          outcomeT += dt;
          if (outcomeT > 1.1) {
            // powtórka + „co by zadziałało” z chwili decyzji (migawka świata) + trzy kroki
            const variantNow = scen.variant;
            const first = firstAction(world), loss = firstLoss(world), cls = classify(world);
            const decisionT = first ? (first.kind === "lost" ? first.t - 1 : first.t - 0.5) : 0.5;
            const snap = snapshotAtOrBefore(rec, Math.max(0, decisionT));
            const rated = snap ? rateOptions(snap) : [];
            const nameOf = (id?: string) => (id === "P" ? "Ty" : world.agents.find((a) => a.id === id)?.name ?? "");
            addAttempt({ date: localISO(), variant: variantNow, cls, first, lossAt: loss ? loss.t : null });
            setResult({
              kind: world.outcome.kind, cls, rec, events: [...world.events], rated, rateT: snap?.t ?? 0, nameOf,
              steps: coachSteps({ variant: variantNow, rated, first, cls, nameOf: (id) => nameOf(id), loss }),
              nextTitle: "nowa, losowa sytuacja", sameTitle: VARIANTS[variantNow]!.title,
            });
            setP("done");
          }
        }

        // kamera za plecami zawodnika, obraca się razem z nim (kierunek dogania płynnie w sterowaniu)
        const cx = Math.cos(dr.cam), cy = Math.sin(dr.cam);
        // bliżej i niżej niż wcześniej (8 m / 4,3 m): zawodnik i piłka większe na małym ekranie, nadal widać kolegów przed sobą
        const ov = import.meta.env.DEV ? (window as unknown as { __camOv?: { back: number; up: number; ahead: number; lookY: number } }).__camOv : undefined;
        const back = ov?.back ?? CAM.back, up = ov?.up ?? CAM.up, ahead = ov?.ahead ?? CAM.ahead, lookY = ov?.lookY ?? CAM.lookY;
        target.set(player.x - back * cx, up, player.y - back * cy);
        look.set(player.x + ahead * cx, lookY, player.y + ahead * cy);
        if (ov) { camPos.copy(target); camLook.copy(look); }
        else { camPos.lerp(target, 1 - Math.exp(-dt * 28)); camLook.lerp(look, 1 - Math.exp(-dt * 28)); }
        cam.position.copy(camPos); cam.lookAt(camLook);
        const fovT = ov ? 55 : FOV_BASE + (FOV_RUN - FOV_BASE) * Math.min(1, dr.speed / 6.5);
        if (Math.abs(cam.fov - fovT) > 0.02) { cam.fov += (fovT - cam.fov) * (ov ? 1 : 1 - Math.exp(-dt * 4)); cam.updateProjectionMatrix(); }
        ballShadow.position.set(ball.position.x, 0.014, ball.position.z);
        const bh = Math.max(0, ball.position.y - BALL_R);
        ballShadow.scale.setScalar(BALL_R * 4.2 * (1 + bh * 1.6));
        (ballShadow.material as THREE.MeshBasicMaterial).opacity = 0.85 / (1 + bh * 2.5);
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
          state: () => ({ heading: dr.heading, cam: dr.cam, speed: dr.speed, x: dr.x, y: dr.y, t: world.t, owner: world.ball.owner, outcome: world.outcome?.kind ?? null }),
          world: () => world,
        };
      }

      return () => {
        cancelAnimationFrame(raf); ro.disconnect();
        window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku);
        renderer.dispose(); el.removeChild(renderer.domElement);
      };
    }

    return () => { alive = false; cleanup(); };
  }, [myLook]); // zmiana wyglądu odbudowuje scenę (nowa, losowa sytuacja)

  const hint = poss === "foe" ? "Rywal z piłką – dobiegnij i odbierz" : poss === "loose" ? "Piłka luźna" : poss === "mate" ? "Piłka u kolegi" : null;

  return (
    <main className="mx-auto max-w-md px-5 pb-32 pt-14">
      <LargeTitle kind="iq" title="IQ" sub="Wyjście spod pressingu + kontratak" />
      <div className="relative overflow-hidden rounded-3xl border border-hairline bg-hairline shadow-sm">
        <div ref={mount} className="h-[58vh] min-h-[340px] w-full" />

        {phase === "loading" && (
          <div className="bw-shimmer absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-white/85 px-4 py-2 text-sm text-muted backdrop-blur">Ładuję zawodników…</span>
          </div>
        )}

        {(phase === "play" || phase === "kick") && (
          <>
            <div className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2">
              <span className="rounded-full bg-white/85 px-3 py-1 text-xs font-medium tabular-nums text-ink backdrop-blur">{clock.toFixed(1)} s</span>
              {aimName && <span className="bw-pop rounded-full bg-white/85 px-3 py-1 text-xs text-accent backdrop-blur">Podanie do: {aimName}</span>}
              {hint && <span key={poss} className="bw-pop rounded-full bg-white/85 px-3 py-1 text-xs text-ink backdrop-blur">{hint}</span>}
            </div>
            <div ref={arrow} className="pointer-events-none absolute left-1/2 top-14 -ml-5 h-10 w-10 opacity-0 transition-opacity duration-200">
              <div className="flex h-full w-full items-center justify-center rounded-full bg-white/85 text-lg leading-none text-[#e0554f] shadow backdrop-blur">▲</div>
            </div>
            <Joystick onChange={(x, y) => { joy.current = { x, y }; }} />
            {poss === "me" && (
              <div className="absolute bottom-5 right-4 flex flex-col items-center gap-3">
                <ActionButton label="Podaj" onTap={() => { act.current = "pass"; }} />
                <ActionButton label="Strzał" onTap={() => { act.current = "shot"; }} />
              </div>
            )}
          </>
        )}

        {phase === "intro" && (
          <div className="bw-backdrop absolute inset-0 flex items-end bg-gradient-to-t from-black/45 via-black/10 to-transparent p-4">
            <div className="bw-sheet w-full rounded-3xl bg-white/95 p-5 backdrop-blur">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted">
                <span>Sytuacja</span>
                <span className="rounded-full bg-hairline/70 px-2 py-0.5 normal-case tracking-normal">Próba {attempt.current + 1} · {VARIANTS[variant]!.title}</span>
              </div>
              <p className="mt-1 text-[15px] leading-snug text-ink">Jesteś numerem {myLook.number} z piłką. Naciska Cię dwóch napastników. {VARIANTS[variant]!.defence}</p>
              <p className="mt-2 text-[15px] leading-snug text-ink">Wyjdź z pressingu. Strata = kontra 3 na 2 – wtedy to Ty ją gasisz.</p>
              <p className="mt-2 text-xs text-muted">Joystick: do przodu – bieg, w bok – skręt (kamera obraca się za Tobą). Patrz w stronę kolegi i podaj.</p>
              {fallback && <p className="mt-2 text-xs text-muted">Uproszczone postacie (nie udało się wczytać modeli).</p>}
              <button onClick={() => setP("play")} className="bw-grad mt-4 w-full rounded-2xl py-3.5 text-base font-medium">Graj</button>
              <button onClick={() => setEditor(true)} className="mt-2 w-full rounded-2xl py-2.5 text-sm text-accent">Mój zawodnik: wygląd i numer</button>
            </div>
          </div>
        )}
      </div>

      {editor && <LookEditor initial={myLook} onSave={(l) => { setMyLook(l); setEditor(false); }} onClose={() => setEditor(false)} />}
      {result && <ResultSheet r={result} onNext={() => reset.current(true)} onSame={() => reset.current(false)} />}
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
