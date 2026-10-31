(async function () {
  'use strict';
  const $ = id => document.getElementById(id), M = window.BWAnim.math, C = window.BWCoaching;
  const params = new URLSearchParams(location.search);
  const response = await fetch('./catalog.json?v=2026.10.30.19', { cache: 'no-cache' });
  if (!response.ok) throw new Error('Animation catalog unavailable');
  const data = await response.json(), records = new Map(data.records.map(r => [r.id, r]));
  let active = null, phase = 0, playing = false, speed = 1, last = null, raf = null;
  let loops = 0, groundSpan = 0, emphasis = true, closeup = false, camera = null;
  const contacts = ['right', 'left'].map(id => { const el = document.createElement('span'); $('contacts').append(el); return { id, el }; });
  const text = (id, value) => { if ($(id).textContent !== value) $(id).textContent = value; };
  function stop() { playing = false; last = null; if (raf !== null) cancelAnimationFrame(raf); raf = null; text('play', 'Odtwórz'); }
  function height() { if (parent !== window) parent.postMessage({ type: 'ballwise-animation-height', height: Math.ceil($('main').getBoundingClientRect().height) }, location.origin); }
  function screenPoint(scene, p) { return [scene.facing < 0 ? 2 * (scene.mirrorX ?? scene.hip[0]) - p[0] : p[0], p[1]]; }
  function box(points, padding, minimumWidth) {
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (const p of points) { xmin = Math.min(xmin, p[0]); xmax = Math.max(xmax, p[0]); ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]); }
    const width = Math.max(minimumWidth, xmax - xmin + padding * 2), h = Math.max(width * 292 / 360, ymax - ymin + padding * 2);
    return [(xmin + xmax - width) / 2, (ymin + ymax - h) / 2, width, h];
  }
  function setCamera() { if (camera) $('stage').setAttribute('viewBox', (closeup ? camera.focus : camera.full).join(' ')); }
  function bounds() {
    const full = [[0, 0], [360, 292]], focus = [];
    for (let i = 0; i < 120; i++) {
      const scene = active.sample(i / 120), a = (scene.torsoAngle ?? 0) * Math.PI / 180;
      if ((scene.opacity ?? 1) < .1) continue;
      const points = [scene.hip, scene.right.knee, scene.left.knee, scene.right.ankle, scene.left.ankle,
        [scene.hip[0] + 105 * Math.sin(a), scene.hip[1] - 105 * Math.cos(a)]];
      for (const side of ['right', 'left']) {
        const arm = window.BWDrawHuman.armPoints(scene, side, scene.torsoAngle ?? 0, scene.view === 'front');
        points.push(arm.shoulder, arm.elbow, arm.wrist);
      }
      full.push(...points.filter(Boolean).map(p => screenPoint(scene, p)));
      for (const marker of C.describe(active.id, scene)?.markers ?? []) focus.push(screenPoint(scene, marker.point));
    }
    camera = { full: box(full, 8, 360), focus: focus.length ? box(focus, 34, 130) : box(full, 8, 360) };
    setCamera();
  }
  function render(p, automatic = false) {
    if (!active) return null;
    if (automatic) loops += Math.floor(p); else loops = 0;
    phase = M.mod(p);
    const scene = active.sample(phase), offset = (scene.groundOffset ?? (scene.groundSpeed ?? 0) * phase) + loops * groundSpan;
    $('athlete').innerHTML = '<g opacity="' + M.clamp(scene.opacity ?? 1) + '">' + drawBallwiseAthlete(scene) + '</g>';
    $('emphasis').innerHTML = emphasis ? '<g opacity="' + M.clamp(scene.opacity ?? 1) + '">' + C.overlay(scene, active.id) + '</g>' : '';
    $('extras').innerHTML = scene.extras ?? '';
    let ticks = ''; for (let x = -520; x <= 920; x += 26) { const q = x - M.mod(offset, 26); ticks += '<path d="M' + q + ',267l-4,5"/>'; }
    $('ground').innerHTML = ticks; text('phase', scene.phase || 'Faza ruchu');
    for (const { id, el } of contacts) {
      const leg = scene[id], label = (id === 'right' ? 'Prawa' : 'Lewa') + ': ' + (leg.contact ? leg.contactId === 'return' ? 'ponowny kontakt' : 'kontakt' : 'w powietrzu');
      if (el.textContent !== label) el.textContent = label;
      const cls = leg.contact ? 'contact' : ''; if (el.className !== cls) el.className = cls;
    }
    const coaching = C.describe(active.id, scene);
    text('focus-title', coaching?.title ?? 'Najważniejszy element ruchu'); text('focus-cue', coaching?.cue ?? '');
    $('progress').value = String(Math.round(phase * 10000));
    return scene;
  }
  function notes(record) {
    text('scope', record.scope || 'Animacja poglądowa · fazy ruchu');
    $('notes').replaceChildren(...(record.notes ?? []).map(note => { const li = document.createElement('li'); li.textContent = note; return li; }));
    const url = record.sourceUrl; $('source').hidden = !(typeof url === 'string' && /^https:\/\//.test(url));
    if (!$('source').hidden) $('source').href = url; $('source-gap').hidden = record.sourceStatus !== 'missing';
  }
  function activate(id) {
    stop(); const record = records.get(id), model = BWAnim.models[id]; $('error').hidden = true;
    if (!record || !model) { active = null; $('player').hidden = true; $('error').hidden = false; text('error', 'Brak animacji dla tego wariantu. Wybierz ćwiczenie w bibliotece.'); height(); return false; }
    active = model; text('title', record.title); notes(record); $('player').hidden = false;
    const end = model.sample(1 - 1e-9), start = model.sample(0);
    groundSpan = (end.groundOffset ?? end.groundSpeed ?? 0) - (start.groundOffset ?? 0);
    const coaching = C.forModel(id);
    text('timing-note', 'Pełna pętla przy 1×: ' + (model.durationMs / 1000).toLocaleString('pl', { maximumFractionDigits: 2 }) + ' s. ' + (coaching?.tempo?.label ?? 'Rytm poglądowy.'));
    bounds(); render(id === 'a_skip' || id === 'review:a_skip:extra_bounce' ? 16 / 39 : .16); height(); return true;
  }
  function choose(id) {
    stop(); const record = records.get(id); $('variant-block').hidden = true; $('variant').replaceChildren();
    if (record?.choices?.length) { active = null; text('title', record.title); notes(record); $('player').hidden = true; $('variant-block').hidden = false;
      $('variant').append(new Option('Wybierz wariant ruchu', ''), ...record.choices.map(c => new Option(c.title, c.id)));
      $('error').hidden = false; text('error', 'Wybierz wariant zapisany w Twojej sesji.'); height(); return; }
    activate(id);
  }
  function library() {
    const query = $('search').value.trim().toLocaleLowerCase('pl'), current = $('exercise').value;
    $('exercise').replaceChildren(...data.gallery.map(id => records.get(id)).filter(r => !query || (r.title + ' ' + r.group).toLocaleLowerCase('pl').includes(query)).map(r => new Option(r.title, r.id)));
    if ([...$('exercise').options].some(x => x.value === current)) $('exercise').value = current;
  }
  function tick(now) { if (!playing || !active) return; if (last !== null) render(phase + (now - last) / active.durationMs * speed, true); last = now; raf = requestAnimationFrame(tick); }
  $('play').onclick = () => { if (playing) { stop(); return; } if (!active) return; playing = true; last = null; text('play', 'Pauza'); raf = requestAnimationFrame(tick); };
  $('previous').onclick = () => { stop(); if (active) render(phase - 1000 / (30 * active.durationMs)); };
  $('next').onclick = () => { stop(); if (active) render(phase + 1000 / (30 * active.durationMs)); };
  $('progress').oninput = () => { stop(); render(Number($('progress').value) / 10000); };
  $('speed').onchange = () => { speed = Number($('speed').value); last = null; };
  $('focus-toggle').onclick = () => { emphasis = !emphasis; $('focus-toggle').setAttribute('aria-pressed', String(emphasis)); $('focus-legend').hidden = !emphasis; render(phase); };
  $('zoom-toggle').onclick = () => { closeup = !closeup; $('zoom-toggle').setAttribute('aria-pressed', String(closeup)); setCamera(); };
  $('variant').onchange = () => activate($('variant').value); $('exercise').onchange = () => choose($('exercise').value); $('search').oninput = library;
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('message', event => { if (event.source === parent && event.origin === location.origin && event.data?.type === 'ballwise-animation-pause') stop(); });
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => { if (!entries[0]?.isIntersecting) stop(); }).observe($('stage'));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'); reduced.addEventListener('change', () => { if (reduced.matches) stop(); });
  if ('ResizeObserver' in window) new ResizeObserver(height).observe($('main'));
  $('library').hidden = params.get('catalog') !== '1' && params.get('embed') === '1'; library();
  const first = params.get('id') || 'a_skip'; if (records.has(first)) $('exercise').value = first; choose(first);
  window.BWPlayer = { ready: true, choose, activate, renderAt: p => { stop(); return render(p); }, getState: () => ({ id: active?.id ?? null, phase, playing, speed, emphasis, closeup }), records: data.records, catalog: data.gallery, stop };
  height();
})().catch(error => { const el = document.getElementById('error'); if (el) { el.hidden = false; el.textContent = 'Nie udało się otworzyć animacji. Odśwież podgląd.'; } console.error(error); });
