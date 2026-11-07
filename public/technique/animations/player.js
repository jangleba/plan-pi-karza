(async function () {
  "use strict";
  const $ = (id) => document.getElementById(id),
    M = window.BWAnim.math,
    C = window.BWCoaching,
    T = window.BWTempo;
  const params = new URLSearchParams(location.search);
  if (params.get("compact") === "1") {
    document.documentElement.classList.add("compact-player");
    const details = document.createElement("details"),
      summary = document.createElement("summary");
    details.className = "compact-technique";
    summary.textContent = "Technika i tempo";
    details.append(summary);
    for (const selector of [
      ".view-tools",
      ".focus-card",
      "#focus-legend",
      "#contacts",
      ".speed",
      "#tempo-form",
      "#box-variant-row",
    ]) {
      const node = document.querySelector(selector);
      if (node) details.append(node);
    }
    $("player").append(details);
  }

  const response = await fetch("./catalog.json?v=2026.11.07.58", { cache: "no-cache" });
  if (!response.ok) throw new Error("Animation catalog unavailable");
  const data = await response.json(),
    records = new Map(data.records.map((r) => [r.id, r]));
  window.BWMotionLibrary.register(data.records);
  const contextId = params.get("id"),
    manualTempo = new Map(),
    manualVariant = new Map();
  let tempoPlan = null;
  const effectiveDuration = () => tempoPlan?.totalMs ?? active?.durationMs ?? 6000;
  let active = null,
    phase = 0,
    playing = false,
    speed = 1,
    last = null,
    raf = null;
  let userPaused = false;
  let loops = 0,
    groundSpan = 0,
    emphasis = false,
    closeup = false,
    camera = null;
  const contacts = ["right", "left"].map((id) => {
    const el = document.createElement("span");
    $("contacts").append(el);
    return { id, el };
  });
  const text = (id, value) => {
    if ($(id).textContent !== value) $(id).textContent = value;
  };
  function stop() {
    playing = false;
    last = null;
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    text("play", "Odtwórz");
  }
  function height() {
    if (parent !== window)
      parent.postMessage(
        {
          type: "ballwise-animation-height",
          height: Math.ceil($("main").getBoundingClientRect().height),
        },
        location.origin,
      );
  }
  function screenPoint(scene, p) {
    return [scene.facing < 0 ? 2 * (scene.mirrorX ?? scene.hip[0]) - p[0] : p[0], p[1]];
  }
  function box(points, padding, minimumWidth) {
    const xs = points.map((p) => p[0]),
      ys = points.map((p) => p[1]);
    const x = Math.min(...xs),
      y = Math.min(...ys),
      w = Math.max(minimumWidth, Math.max(...xs) - x + padding * 2),
      h = Math.max(130, Math.max(...ys) - y + padding * 2);
    return [(Math.max(...xs) + x - w) / 2, (Math.max(...ys) + y - h) / 2, w, h];
  }
  function setCamera() {
    if (camera) {
      const b = closeup ? camera.focus : camera.full;
      $("stage").setAttribute("viewBox", b.join(" "));
      if (params.get("mirror") === "1")
        $("demonstration").setAttribute("transform", `translate(${2 * b[0] + b[2]} 0) scale(-1 1)`);
    }
  }
  function bounds() {
    const full = [],
      focus = [];
    for (let i = 0; i < 120; i++) {
      const scene = active.sample(i / 120);
      if ((scene.opacity ?? 1) < 0.1) continue;
      if (i % 20 === 0 && scene.extras) {
        $("extras").innerHTML = scene.extras;
        const b = $("extras").getBBox();
        if (b.width || b.height) full.push([b.x, b.y], [b.x + b.width, b.y + b.height]);
      }
      full.push(
        ...[...window.BWDrawHuman.points(scene), ...(scene.framingPoints ?? [])].map((p) =>
          screenPoint(scene, p),
        ),
      );
      for (const marker of C.describe(active.id, scene)?.markers ?? [])
        focus.push(screenPoint(scene, marker.point));
    }
    camera = {
      full: box(full, 12, 150),
      focus: focus.length ? box(focus, 35, 130) : box(full, 12, 150),
    };
    setCamera();
  }
  function render(p, automatic = false) {
    if (!active) return null;
    if (automatic) loops += Math.floor(p);
    else loops = 0;
    phase = tempoPlan?.kind === "hold" ? M.clamp(p) : M.mod(p);
    const tempoFrame = tempoPlan ? T.tempoFrameAt(tempoPlan, phase) : null;
    const scene = active.sample(tempoFrame?.modelPhase ?? phase),
      offset = (scene.groundOffset ?? (scene.groundSpeed ?? 0) * phase) + loops * groundSpan;
    if (tempoPlan?.kind === "hold")
      scene.breath = 0.5 + 0.5 * Math.sin(((phase * tempoPlan.totalMs) / 5000) * Math.PI * 2);
    $("athlete").innerHTML =
      '<g opacity="' + M.clamp(scene.opacity ?? 1) + '">' + drawBallwiseAthlete(scene) + "</g>";
    $("emphasis").innerHTML = emphasis
      ? '<g opacity="' + M.clamp(scene.opacity ?? 1) + '">' + C.overlay(scene, active.id) + "</g>"
      : "";
    $("extras").innerHTML = scene.extras ?? "";
    $("extras-front").innerHTML = scene.frontExtras ?? "";
    $("ground-line").setAttribute("d", scene.groundLine ?? "M-500 264H900");
    $("ground").style.display = scene.groundLine ? "none" : "";
    let ticks = "";
    for (let x = -520; x <= 920; x += 26) {
      const q = x - M.mod(offset, 26);
      ticks += '<path d="M' + q + ',267l-4,5"/>';
    }
    $("ground").innerHTML = ticks;
    text("phase", scene.phase || "Faza ruchu");
    text("view-label", scene.viewLabel || "Widok z boku");
    for (const { id, el } of contacts) {
      const leg = scene[id],
        label =
          (id === "right" ? "Prawa" : "Lewa") +
          ": " +
          (leg.contactSurface === "brace"
            ? "stopa ustalona"
            : leg.contactSurface === "pedal"
              ? "na pedale"
              : leg.contact
                ? leg.contactId === "return"
                  ? "ponowny kontakt"
                  : "kontakt"
                : "bez podporu stopy");
      if (el.textContent !== label) el.textContent = label;
      const cls = leg.contact ? "contact" : "";
      if (el.className !== cls) el.className = cls;
    }
    const coaching = active.motionFamily
      ? { title: "Na co zwrócić uwagę", cue: scene.phase }
      : C.describe(active.id, scene);
    text("focus-title", coaching?.title ?? "Najważniejszy element ruchu");
    text("focus-cue", coaching?.cue ?? "");
    $("progress").value = String(Math.round(phase * 10000));
    if (tempoFrame) {
      text("tempo-phase", tempoFrame.label);
      text(
        "tempo-kind",
        tempoFrame.key === "eccentric"
          ? "Faza ekscentryczna"
          : tempoFrame.key === "concentric"
            ? "Faza koncentryczna"
            : tempoFrame.key === "hold"
              ? "Utrzymanie"
              : tempoFrame.key === "bottom" || tempoFrame.key === "top"
                ? "Pauza"
                : "Ustawienie",
      );
      text(
        "tempo-count",
        tempoFrame.count === null
          ? tempoFrame.dynamic
            ? "↑"
            : "↻"
          : String(tempoFrame.count).replace(".", ","),
      );
      text(
        "tempo-unit",
        tempoFrame.count === null ? (tempoFrame.dynamic ? "dynamicznie" : "podgląd") : "s",
      );
      text("tempo-speed", speed === 1 ? "1×" : `Podgląd ${speed.toLocaleString("pl")}×`);
      for (const chip of $("tempo-track").children)
        chip.classList.toggle("is-current", chip.dataset.phase === tempoFrame.key);
      if (tempoFrame.complete && playing) stop();
    }
    return scene;
  }
  function notes(record) {
    text("scope", record.scope || "Animacja poglądowa · fazy ruchu");
    $("notes").replaceChildren(
      ...(record.notes ?? []).map((note) => {
        const li = document.createElement("li");
        li.textContent = note;
        return li;
      }),
    );
    const url = record.sourceUrl;
    $("source").hidden = !(typeof url === "string" && /^https:\/\//.test(url));
    if (!$("source").hidden) $("source").href = url;
    $("source-gap").hidden = record.sourceStatus !== "missing";
  }
  function configureTempo(id) {
    const saved = manualTempo.get(id),
      inSession = id === contextId;
    const raw = saved ? saved.tempo : inSession ? params.get("tempo") : null;
    const hold = saved ? saved.holdSeconds : inSession ? Number(params.get("hold")) : null;
    tempoPlan = T.createTempoPlan(active, raw, {
      source: saved ? "preview" : "session",
      holdSeconds: hold,
    });
    $("tempo-panel").hidden = !tempoPlan;
    $("tempo-example").hidden =
      Boolean(tempoPlan) || active.tempoProfile?.kind !== "rep" || Boolean(raw);
    $("tempo-form").hidden = !active.tempoProfile;
    const isHold = active.tempoProfile?.kind === "hold";
    $("tempo-input").value = raw ?? (hold ? `${hold} s` : "");
    $("tempo-input").placeholder = isHold ? "np. 30 s" : "np. 3-0-1-0";
    $("tempo-form").querySelector("label").textContent = isHold
      ? "Czas utrzymania w podglądzie"
      : "Tempo podglądu · opuszczanie / dół / podnoszenie / góra";
    $("tempo-help").textContent =
      "Zmienia tylko podgląd. Tempo zapisane w sesji pozostaje bez zmian.";
    $("tempo-help").removeAttribute("role");
    $("tempo-session").hidden = !saved;
    $("tempo-source").textContent = tempoPlan
      ? tempoPlan.source === "session"
        ? "Tempo z sesji"
        : "Tempo podglądu"
      : "";
    $("tempo-track").replaceChildren();
    for (const phase of tempoPlan?.phases ?? []) {
      const chip = document.createElement("span");
      chip.dataset.phase = phase.key;
      const illustrative = tempoPlan.segments.find((s) => s.key === phase.key)?.illustrative;
      const name =
        phase.key === "eccentric"
          ? "↓"
          : phase.key === "concentric"
            ? "↑"
            : phase.key === "bottom"
              ? active.variant === "box_touch"
                ? "Skrzynia"
                : "Dół"
              : phase.key === "top"
                ? "Góra"
                : phase.key === "hold"
                  ? "Utrzymanie"
                  : "↻";
      chip.textContent = `${name} · ${illustrative ? "podgląd" : phase.value === "X" ? "X" : phase.value === 0 ? "bez pauzy" : String(phase.value).replace(".", ",") + " s"}`;
      $("tempo-track").append(chip);
    }
    $("box-variant-row").hidden = !active.supportsBoxTouch;
    $("movement-variant").value = active.variant ?? "";
  }
  function activate(id) {
    stop();
    const record = records.get(id),
      model = BWAnim.models[id];
    $("error").hidden = true;
    if (!record || !model) {
      active = null;
      $("player").hidden = true;
      $("error").hidden = false;
      text("error", "Brak animacji dla tego wariantu. Wybierz ćwiczenie w bibliotece.");
      height();
      return false;
    }
    active = window.BWMotionLibrary.withVariant(
      id,
      manualVariant.get(id) ?? (id === contextId ? params.get("variant") : null),
    );
    configureTempo(id);
    userPaused = false;
    text("title", record.title);
    notes(record);
    $("player").hidden = false;
    const end = model.sample(1 - 1e-9),
      initial = model.sample(0);
    groundSpan = (end.groundOffset ?? end.groundSpeed ?? 0) - (initial.groundOffset ?? 0);
    const coaching = C.forModel(id);
    text(
      "timing-note",
      tempoPlan
        ? tempoPlan.spec
          ? `Tempo ${tempoPlan.source === "session" ? "z sesji" : "podglądu"}: ${tempoPlan.spec.label}. ${tempoPlan.spec.values.includes("X") ? "X oznacza dynamiczny zamiar, bez narzuconej liczby sekund. Rysunek ma tempo poglądowe." : "Sekundy odpowiadają tempu przy 1×."} Licznik nie zapisuje serii ani powtórzeń.`
          : "Podgląd utrzymania pozycji. Licznik nie zapisuje wykonania ćwiczenia."
        : `Pełna pętla przy 1×: ${(model.durationMs / 1000).toLocaleString("pl", { maximumFractionDigits: 2 })} s. ${id === contextId && params.get("tempo") ? "Zapis z sesji: " + params.get("tempo") + ". " : ""}To rytm rysunku, a nie narzucone tempo ćwiczenia. ${coaching?.tempo?.label ?? ""}`,
    );
    bounds();
    render(tempoPlan ? 0 : id === "a_skip" || id === "review:a_skip:extra_bounce" ? 16 / 39 : 0.16);
    height();
    if (params.get("autoplay") === "1" && !reduced.matches && !document.hidden) start();
    return true;
  }
  function choose(id) {
    stop();
    const record = records.get(id);
    $("variant-block").hidden = true;
    $("variant").replaceChildren();
    if (record?.choices?.length) {
      active = null;
      text("title", record.title);
      notes(record);
      $("player").hidden = true;
      $("variant-block").hidden = false;
      $("variant").append(
        new Option("Wybierz wariant ruchu", ""),
        ...record.choices.map((c) => new Option(c.title, c.id)),
      );
      $("error").hidden = false;
      text("error", "Wybierz wariant zapisany w Twojej sesji.");
      height();
      return;
    }
    activate(id);
  }
  function library() {
    const query = $("search").value.trim().toLocaleLowerCase("pl"),
      current = $("exercise").value;
    $("exercise").replaceChildren(
      ...data.gallery
        .map((id) => records.get(id))
        .filter((r) => !query || (r.title + " " + r.group).toLocaleLowerCase("pl").includes(query))
        .map((r) => new Option(r.title, r.id)),
    );
    if ([...$("exercise").options].some((x) => x.value === current)) $("exercise").value = current;
  }
  let lastDraw = null;
  function tick(now) {
    if (!playing || !active) return;
    if (last !== null) {
      const elapsed = now - last;
      phase += (elapsed / effectiveDuration()) * speed;
      if (lastDraw === null || now - lastDraw >= 1000 / 30) {
        render(phase, true);
        lastDraw = now;
        if (!playing) return;
      }
    }
    last = now;
    raf = requestAnimationFrame(tick);
  }
  function start() {
    if (!active || playing) return;
    if (tempoPlan?.kind === "hold" && phase >= 1) render(0);
    playing = true;
    last = lastDraw = null;
    text("play", "Pauza");
    if (parent !== window)
      parent.postMessage({ type: "ballwise-animation-playing" }, location.origin);
    raf = requestAnimationFrame(tick);
  }
  $("play").onclick = () => {
    if (playing) {
      userPaused = true;
      stop();
    } else {
      userPaused = false;
      start();
    }
  };
  $("previous").onclick = () => {
    userPaused = true;
    stop();
    if (active) render(phase - 1000 / (30 * effectiveDuration()));
  };
  $("next").onclick = () => {
    userPaused = true;
    stop();
    if (active) render(phase + 1000 / (30 * effectiveDuration()));
  };
  $("progress").oninput = () => {
    userPaused = true;
    stop();
    render(Number($("progress").value) / 10000);
  };
  $("speed").onchange = () => {
    speed = Number($("speed").value);
    last = null;
    render(phase);
  };
  $("focus-toggle").onclick = () => {
    emphasis = !emphasis;
    $("focus-toggle").setAttribute("aria-pressed", String(emphasis));
    $("focus-legend").hidden = !emphasis;
    render(phase);
  };
  $("zoom-toggle").onclick = () => {
    closeup = !closeup;
    $("zoom-toggle").setAttribute("aria-pressed", String(closeup));
    setCamera();
  };
  $("tempo-example").onclick = () => {
    if (active) {
      manualTempo.set(active.id, { tempo: "3-0-1-0", holdSeconds: null });
      activate(active.id);
      $("play").focus({ preventScroll: true });
    }
  };
  $("tempo-form").onsubmit = (event) => {
    event.preventDefault();
    if (!active) return;
    const raw = $("tempo-input").value,
      hold = active.tempoProfile?.kind === "hold";
    const seconds = hold ? T.parseHoldSeconds(raw) : null;
    if (hold ? seconds === null : !T.parseExerciseTempo(raw)) {
      $("tempo-help").setAttribute("role", "alert");
      $("tempo-help").textContent = hold
        ? "Podaj pojedynczy czas, np. 30 s."
        : "Podaj 3 lub 4 fazy, np. 3-0-1-0. X oznacza dynamicznie.";
      return;
    }
    manualTempo.set(active.id, { tempo: hold ? null : raw, holdSeconds: seconds });
    activate(active.id);
  };
  $("tempo-session").onclick = () => {
    if (active) {
      manualTempo.delete(active.id);
      activate(active.id);
    }
  };
  $("movement-variant").onchange = () => {
    if (active) {
      manualVariant.set(active.id, $("movement-variant").value);
      activate(active.id);
    }
  };
  $("variant").onchange = () => activate($("variant").value);
  $("exercise").onchange = () => choose($("exercise").value);
  $("search").oninput = library;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
  });
  window.addEventListener("message", (event) => {
    if (
      event.source === parent &&
      event.origin === location.origin &&
      event.data?.type === "ballwise-animation-pause"
    )
      stop();
  });
  if ("IntersectionObserver" in window)
    new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) stop();
      else if (
        params.get("autoplay") === "1" &&
        !reduced.matches &&
        !userPaused &&
        !document.hidden
      )
        start();
    }).observe($("stage"));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  reduced.addEventListener("change", () => {
    if (reduced.matches) stop();
  });
  if ("ResizeObserver" in window) new ResizeObserver(height).observe($("main"));
  $("library").hidden = params.get("catalog") !== "1" && params.get("embed") === "1";
  library();
  $("focus-toggle").setAttribute("aria-pressed", "false");
  $("focus-legend").hidden = true;
  const first = params.get("id") || "a_skip";
  if (records.has(first)) $("exercise").value = first;
  choose(first);
  window.BWPlayer = {
    ready: true,
    choose,
    activate,
    renderAt: (p) => {
      userPaused = true;
      stop();
      return render(p);
    },
    getState: () => ({
      id: active?.id ?? null,
      phase,
      playing,
      speed,
      emphasis,
      closeup,
      durationMs: effectiveDuration(),
      variant: active?.variant ?? null,
      tempo: tempoPlan
        ? {
            ...T.tempoFrameAt(tempoPlan, phase),
            kind: tempoPlan.kind,
            source: tempoPlan.source,
            spec: tempoPlan.spec?.label ?? null,
          }
        : null,
    }),
    records: data.records,
    catalog: data.gallery,
    stop,
    start,
    camera: () => camera,
  };
  height();
})().catch((error) => {
  const el = document.getElementById("error");
  if (el) {
    el.hidden = false;
    el.textContent = "Nie udało się otworzyć animacji. Odśwież podgląd.";
  }
  console.error(error);
});
