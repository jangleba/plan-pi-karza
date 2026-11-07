/* Shared human figure for every instructional motion. Pose inputs remain untouched. */
(function (scope) {
  "use strict";
  // Local bindings: global lookups are slow when the renderer runs inside a
  // sandboxed context (tests, snapshot generation), and this runs per frame.
  const { Math, Number, Array, String } = scope,
    round = Math.round,
    finite = Number.isFinite;
  const fmt = (n) => {
    // Integer hundredths: two decimals stay far below a screen pixel, and
    // integer-to-string is much cheaper than formatting a double.
    if (!finite(n)) return String(n);
    let v = round(n * 100);
    const sign = v < 0 ? "-" : "";
    if (v < 0) v = -v;
    const r = v % 100;
    return (
      sign +
      (v - r) / 100 +
      (r === 0 ? "" : r < 10 ? ".0" + r : r % 10 === 0 ? "." + r / 10 : "." + r)
    );
  };
  const xy = (p) => fmt(p[0]) + "," + fmt(p[1]);
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const scale = (a, n) => [a[0] * n, a[1] * n];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const point = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  const unit = (a, b) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  };
  const normal = (v) => [-v[1], v[0]];
  const rotate = (p, degrees) => {
    const a = (degrees * Math.PI) / 180,
      c = Math.cos(a),
      s = Math.sin(a);
    return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
  };
  const flexion = (a, b, c) => {
    const u = unit(b, a),
      v = unit(b, c);
    return 180 - (Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]))) * 180) / Math.PI;
  };
  const path = (d, extra = "") => `<path d="${d}" ${extra}/>`;
  const detail = (d, extra = "") =>
    path(d, `fill="none" ${extra.includes("stroke-width=") ? "" : 'stroke-width=".72"'} ${extra}`);

  /** Closed Catmull-Rom spline through anatomical landmarks: no corners. */
  function smoothClosed(ps, tension = 1 / 6) {
    const n = ps.length,
      at = (i) => ps[(i + n) % n];
    let d = `M${xy(ps[0])}`;
    for (let i = 0; i < n; i++) {
      const p0 = at(i - 1),
        p1 = at(i),
        p2 = at(i + 1),
        p3 = at(i + 2);
      d += `C${xy(add(p1, scale(add(p2, scale(p0, -1)), tension)))} ${xy(add(p2, scale(add(p3, scale(p1, -1)), -tension)))} ${xy(p2)}`;
    }
    return d + "Z";
  }
  /** Open Catmull-Rom curve, used for anatomical detail lines. */
  function smoothOpen(ps) {
    let d = `M${xy(ps[0])}`;
    for (let i = 0; i < ps.length - 1; i++) {
      const p0 = ps[Math.max(0, i - 1)],
        p1 = ps[i],
        p2 = ps[i + 1],
        p3 = ps[Math.min(ps.length - 1, i + 2)];
      d += `C${xy(add(p1, scale(add(p2, scale(p0, -1)), 1 / 6)))} ${xy(add(p2, scale(add(p3, scale(p1, -1)), -1 / 6)))} ${xy(p2)}`;
    }
    return d;
  }
  // Fine anatomy lines (fingers, toes, kneecap, face): thinner and lighter
  // than the outline, and never part of the merged silhouette.
  const DETAIL_INK = (far) => (far ? "#a9b7c2" : "#6c8294");
  const details = (lines, far, map = (p) => p) =>
    lines.length
      ? `<g class="bw-human-detail" fill="none" stroke="${DETAIL_INK(far)}" stroke-width=".7">` +
        lines.map((ps) => `<path d="${smoothOpen(ps.map(map))}"/>`).join("") +
        "</g>"
      : "";
  /* Hands in a local frame: x runs from the wrist along the hand, the thumb
   * sits on the -y side. "open" is a flat hand with fingers together (support
   * and reaching), "fist" a relaxed running hand with curled fingers. */
  const HANDS = {
    open: {
      outline: [
        [-0.6, -3],
        [3, -4],
        [6.2, -5.8],
        [8.8, -6.6],
        [9.6, -5.4],
        [8, -4.1],
        [11.4, -3.6],
        [16, -2.8],
        [18, -1.3],
        [17.9, 0.9],
        [15.6, 2.6],
        [10.4, 3.6],
        [5, 4],
        [-0.6, 3],
      ],
      lines: [
        [
          [10.8, -1.4],
          [14, -1.3],
          [16.8, -1.1],
        ],
        [
          [10.8, 1],
          [13.8, 1.2],
          [16.4, 1.5],
        ],
        [
          [3.2, -2.4],
          [5.6, -3],
          [7.6, -3.9],
        ],
      ],
    },
    fist: {
      outline: [
        [-0.6, -3],
        [3, -4.3],
        [7, -4.9],
        [10.2, -3.8],
        [11.4, -0.8],
        [10.6, 2.6],
        [7.6, 4.4],
        [3, 4.2],
        [-0.6, 3],
      ],
      lines: [
        [
          [2.6, -3.5],
          [5.6, -3],
          [8.6, -1.6],
        ],
        [
          [9.2, -2.4],
          [10.2, -1],
          [9.8, 0.4],
        ],
        [
          [9.6, 0.8],
          [10.2, 2],
          [9, 3.2],
        ],
      ],
    },
  };
  /** Hand outline and finger lines, placed at the wrist along `axis`. */
  function handShape(wrist, axis, kind, far, map = (p) => p) {
    const n = normal(axis),
      // Thumb toward the front and up: forward for a hanging arm, on top for a
      // reaching one.
      thumb = n[0] - n[1] > 0 ? 1 : -1,
      hand = HANDS[kind] ?? HANDS.open,
      place = ([x, y]) => map(add(wrist, add(scale(axis, x), scale(n, -thumb * y))));
    return (
      `<g class="bw-human-hand bw-human-hand-${kind}">` +
      path(smoothClosed(hand.outline.map(place))) +
      details(
        hand.lines.map((ps) => ps.map(place)),
        far,
      ) +
      "</g>"
    );
  }
  const ease = (t) => t * t * (3 - 2 * t);
  /** One body segment shaped by anatomical knots [t, front, back]: the
   * half-width in front of (anterior, -normal) and behind (posterior,
   * +normal) the bone line at fraction t. Widths ease between knots with zero
   * slope, and both ends close in round caps, so two segments overlapping at
   * a joint read as a natural knee or elbow at any bend. `symmetric` averages
   * front and back for views where the limb faces the camera. */
  function segment(a, b, knots, symmetric = false) {
    const u = unit(a, b),
      n = normal(u),
      ks = symmetric ? knots.map(([t, f, k]) => [t, (f + k) / 2, (f + k) / 2]) : knots;
    const at = (t, side) => {
      let i = 0;
      while (i < ks.length - 2 && t > ks[i + 1][0]) i++;
      const [t0, ...r0] = ks[i],
        [t1, ...r1] = ks[i + 1],
        e = ease(Math.max(0, Math.min(1, (t - t0) / (t1 - t0))));
      return r0[side] + (r1[side] - r0[side]) * e;
    };
    const steps = 10,
      back = [],
      front = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps,
        c = mix(a, b, t);
      back.push(add(c, scale(n, at(t, 1))));
      front.push(add(c, scale(n, -at(t, 0))));
    }
    const side = (ps) => {
      let d = "";
      for (let i = 0; i < ps.length - 1; i++) {
        const p0 = ps[Math.max(0, i - 1)],
          p1 = ps[i],
          p2 = ps[i + 1],
          p3 = ps[Math.min(ps.length - 1, i + 2)];
        d += `C${xy(add(p1, scale(add(p2, scale(p0, -1)), 1 / 6)))} ${xy(add(p2, scale(add(p3, scale(p1, -1)), -1 / 6)))} ${xy(p2)}`;
      }
      return d;
    };
    // Caps: a half circle spanning the front and back edge at each end.
    const cap = (p, q, dir) => {
      const r = Math.hypot(q[0] - p[0], q[1] - p[1]) / 2,
        tip = add(mix(p, q, 0.5), scale(dir, r));
      return `A${fmt(r)},${fmt(r)} 0 0 0 ${xy(tip)}A${fmt(r)},${fmt(r)} 0 0 0 ${xy(q)}`;
    };
    return path(
      `M${xy(back[0])}${side(back)}${cap(back[steps], front[steps], u)}${side(front.slice().reverse())}${cap(front[0], back[0], scale(u, -1))}Z`,
    );
  }
  /** Average half-width of a profile at fraction t (front views). */
  function widthAt(knots, t) {
    let i = 0;
    while (i < knots.length - 2 && t > knots[i + 1][0]) i++;
    const [t0, f0, b0] = knots[i],
      [t1, f1, b1] = knots[i + 1],
      e = ease(Math.max(0, Math.min(1, (t - t0) / (t1 - t0))));
    return (f0 + b0 + (f1 + b1 - f0 - b0) * e) / 2;
  }
  /** Upper and lower limb segments from an anatomical profile. */
  function limb(a, b, c, profile, symmetric = false) {
    return segment(a, b, profile.upper, symmetric) + segment(b, c, profile.lower, symmetric);
  }
  /** A point on a segment: fraction t along it, `off` units behind (+) or in
   * front (-) of the bone line. */
  const onSegment = (a, b, t, off) => add(mix(a, b, t), scale(normal(unit(a, b)), off));

  const colours = {
    skin: "#fff",
    farSkin: "#fff",
    shirt: "#fff",
    farShirt: "#fff",
    shorts: "#fff",
    ink: "#344b5e",
    hair: "#fff",
    shoe: "#fff",
  };
  // Teaching emphasis only: typical primary groups, never measured activation.
  function muscles(scene = {}) {
    const id = String(scene.motionId || scene.sequenceId || ""),
      family = scene.motionFamily || "";
    if (
      /stretch|mobility|rockback|rotation|cat_camel|breath|cooldown|bwprep:(ankle|hamstring|quad|hip|adductor|cat|rotation|soleus)/.test(
        id,
      )
    )
      return [];
    if (/tibialis/.test(id)) return ["tibialis"];
    if (/soleus/.test(id)) return ["soleus"];
    if (/calf|pogo|ankle_hop/.test(id)) return ["calves"];
    if (/adductor_bridge/.test(id)) return ["adductors", "glutes"];
    if (/copenhagen/.test(id)) return ["adductors", "obliques"];
    if (/nordic|leg_curl|hamstring|long_lever|bridge_walkout/.test(id))
      return ["hamstrings", "glutes"];
    if (/face_pull/.test(id)) return ["rear_delts", "upper_back"];
    if (/overhead_press|push_press|pike_push/.test(id)) return ["delts", "triceps"];
    if (/push_up|bench_press/.test(id)) return ["pecs", "triceps"];
    if (/pull_up|pulldown|dumbbell_row|bodyweight_row/.test(id)) return ["lats", "biceps"];
    if (/pallof|side_plank/.test(id)) return ["obliques"];
    if (/plank|dead_bug|bird_dog/.test(id)) return ["abdominals"];
    if (
      /squat|lunge|step_up|leg_press|leg_extension/.test(id) ||
      ["squat", "split", "step_up", "lateral_lunge"].includes(family)
    )
      return ["quadriceps", "glutes"];
    if (/deadlift|kettlebell_swing|back_extension/.test(id) || family === "hinge")
      return ["hamstrings", "glutes", "erectors"];
    if (/glute_bridge|hip_thrust|bwprep:bridge/.test(id)) return ["glutes", "hamstrings"];
    if (/carry/.test(id)) return ["abdominals", "forearms"];
    if (/clean|med.*ball/.test(id)) return ["quadriceps", "glutes", "upper_back"];
    if (
      /skip|march|sprint|run|acceleration|velocity|bound|jump|hops/.test(id) ||
      ["run", "jump", "carry", "power_lift"].includes(family)
    )
      return ["quadriceps", "calves", "glutes"];
    return [];
  }
  // Working muscles: filled bellies inside the outline, only for the groups the
  // exercise trains. A teaching cue, never measured activation.
  const MUSCLE_STYLE = (far) =>
    `fill="#f59e6b" fill-opacity="${far ? 0.16 : 0.3}" stroke="#d9622b" stroke-width=".8" stroke-opacity="${far ? 0.45 : 0.9}"`;
  function belly(a, b, t0, t1, normalVector, base, bulge) {
    const start = add(mix(a, b, t0), scale(normalVector, base)),
      end = add(mix(a, b, t1), scale(normalVector, base)),
      middle = mix(a, b, (t0 + t1) / 2),
      outer = add(middle, scale(normalVector, base + bulge * 2)),
      inner = add(middle, scale(normalVector, base - bulge * 0.35));
    return `M${xy(start)}Q${xy(outer)} ${xy(end)}Q${xy(inner)} ${xy(start)}Z`;
  }
  function muscleLines(a, b, c, kind, far, scene, side = "right") {
    // The figure faces +x before mirroring, so a segment's anterior side is
    // the negative normal: quadriceps, tibialis and biceps in front, the
    // posterior chain behind.
    const groups = muscles(scene),
      front = scale(normal(unit(a, b)), -1),
      lowerFront = scale(normal(unit(b, c)), -1);
    let svg = "";
    const shape = (name, d) => {
      if (groups.includes(name))
        svg += `<g data-muscle="${name}">${path(d, MUSCLE_STYLE(far))}</g>`;
    };
    if (kind === "leg") {
      shape("quadriceps", belly(a, b, 0.16, 0.86, front, 1.2, 4.6));
      shape("hamstrings", belly(a, b, 0.18, 0.84, front, -1.4, -4.4));
      shape("adductors", belly(a, b, 0.14, 0.62, front, -0.6, -2.6));
      shape("glutes", belly(a, b, -0.08, 0.26, front, -3.5, -4.2));
      shape("calves", belly(b, c, 0.1, 0.62, lowerFront, -0.8, -3.4));
      shape("soleus", belly(b, c, 0.3, 0.8, lowerFront, -0.6, -2.6));
      shape("tibialis", belly(b, c, 0.14, 0.78, lowerFront, 0.6, 1.9));
    } else {
      shape("biceps", belly(a, b, 0.22, 0.86, front, 0.5, 2.4));
      shape("triceps", belly(a, b, 0.16, 0.84, front, -0.6, -2.5));
      shape("delts", belly(a, b, -0.06, 0.34, front, 0.2, 3.1));
      shape("rear_delts", belly(a, b, -0.06, 0.32, front, -0.3, -2.8));
      shape("forearms", belly(b, c, 0.08, 0.62, lowerFront, 0.3, 1.9));
    }
    return `<g class="bw-muscle-traces" data-side="${side}">${svg}</g>`;
  }
  function shorts(a, b, far = false) {
    const u = unit(a, b),
      n = normal(u),
      hem = mix(a, b, 0.49),
      outer = far ? 11.5 : 12.5;
    const p = (point, off) => add(point, scale(n, off));
    return (
      '<g class="bw-human-shorts" fill="#fff">' +
      path(
        `M${xy(p(a, 10))}Q${xy(p(mix(a, hem, 0.5), 15))} ${xy(p(hem, outer))}Q${xy(add(hem, scale(u, 3)))} ${xy(p(hem, -outer))}Q${xy(p(mix(a, hem, 0.5), -14))} ${xy(p(a, -10))}Z`,
      ) +
      detail(
        `M${xy(p(mix(a, hem, 0.22), -8))}Q${xy(p(mix(a, hem, 0.55), -6))} ${xy(p(mix(a, hem, 0.82), -7))}`,
        'opacity=".28" stroke-width=".55"',
      ) +
      "</g>"
    );
  }
  function sleeve(a, b) {
    const u = unit(a, b),
      n = normal(u),
      hem = mix(a, b, 0.39),
      p = (x, o) => add(x, scale(n, o));
    return (
      '<g class="bw-human-sleeve" fill="#fff">' +
      path(
        `M${xy(p(a, 7))}Q${xy(p(mix(a, hem, 0.4), 10))} ${xy(p(hem, 8.5))}Q${xy(add(hem, scale(u, 1.6)))} ${xy(p(hem, -8.5))}Q${xy(p(mix(a, hem, 0.4), -10))} ${xy(p(a, -7))}Z`,
      ) +
      "</g>"
    );
  }
  function torsoMuscles(scene, transform, rear = false, profile = false) {
    const groups = muscles(scene);
    const shape = (name, points) => {
      if (!groups.includes(name)) return "";
      const [p0, p1, p2, p3] = points.map(transform);
      return `<g data-muscle="${name}">${path(`M${xy(p0)}Q${xy(p1)} ${xy(p2)}Q${xy(p3)} ${xy(p0)}Z`, MUSCLE_STYLE(false))}</g>`;
    };
    const pair = (name, points) =>
      shape(name, points) +
      shape(
        name,
        points.map(([x, y]) => [-x, y]),
      );
    if (profile)
      // Side view: x is anterior, so each group sits on its own surface.
      return (
        '<g class="bw-muscle-traces bw-torso-muscles">' +
        shape("pecs", [
          [6, -61],
          [15.5, -55],
          [12.5, -45],
          [6.5, -51],
        ]) +
        shape("abdominals", [
          [8, -42],
          [13, -30],
          [9.5, -17],
          [7, -30],
        ]) +
        shape("obliques", [
          [2, -39],
          [6.5, -28],
          [2, -17],
          [-1.5, -28],
        ]) +
        shape("lats", [
          [-8, -53],
          [-14.5, -41],
          [-6, -28],
          [-6, -43],
        ]) +
        shape("upper_back", [
          [-6, -63],
          [-15.5, -58],
          [-12, -49],
          [-7.5, -56],
        ]) +
        shape("erectors", [
          [-12, -46],
          [-16, -32],
          [-12.5, -16],
          [-10, -32],
        ]) +
        "</g>"
      );
    let svg = "";
    if (rear) {
      svg += pair("upper_back", [
        [-3, -60],
        [-15, -58],
        [-7, -46],
        [-4, -52],
      ]);
      svg += pair("lats", [
        [-14, -50],
        [-17, -36],
        [-7, -26],
        [-9, -40],
      ]);
      svg += pair("erectors", [
        [-2.5, -44],
        [-6, -32],
        [-3, -18],
        [-1.5, -31],
      ]);
    } else {
      svg += pair("pecs", [
        [-1.5, -58],
        [-15, -57],
        [-12, -46],
        [-3, -47],
      ]);
      svg += pair("abdominals", [
        [-1.5, -43],
        [-7, -32],
        [-2, -19],
        [-1, -31],
      ]);
      svg += pair("lats", [
        [-15, -50],
        [-18, -38],
        [-12, -30],
        [-13, -42],
      ]);
    }
    svg += pair("obliques", [
      [-13, -36],
      [-15, -26],
      [-9, -18],
      [-10, -28],
    ]);
    return '<g class="bw-muscle-traces bw-torso-muscles">' + svg + "</g>";
  }

  function armPoints(scene, side, angle, front) {
    const far = side === "left";
    const shoulder = add(scene.hip, rotate([front ? (far ? -15 : 15) : far ? -4 : 2, -61], angle));
    const explicit = scene.arms?.[side];
    if (explicit && [explicit.elbow, explicit.wrist].every(point)) return { shoulder, ...explicit };
    const target = scene.handTargets?.[side];
    if (point(target)) {
      const dx = target[0] - shoulder[0],
        dy =
          Math.hypot(target[0] - shoulder[0], target[1] - shoulder[1]) < 0.001
            ? 1
            : target[1] - shoulder[1],
        length = Math.max(0.001, Math.hypot(dx, dy));
      const d = Math.max(15.3, Math.min(67.8, length)),
        wrist = [shoulder[0] + (dx / length) * d, shoulder[1] + (dy / length) * d];
      const a = (36 * 36 - 32 * 32 + d * d) / (2 * d),
        h = Math.sqrt(Math.max(0, 36 * 36 - a * a));
      const bend = scene.elbowBend?.[side] ?? (front && far ? 1 : -1);
      return {
        shoulder,
        elbow: [
          shoulder[0] + (a * dx) / length + (bend * h * dy) / length,
          shoulder[1] + (a * dy) / length - (bend * h * dx) / length,
        ],
        wrist,
      };
    }
    if (scene.armAngles?.[side]) {
      const spec = scene.armAngles[side],
        a = (spec.upper * Math.PI) / 180,
        b = (spec.lower * Math.PI) / 180;
      const elbow = [shoulder[0] + 30 * Math.sin(a), shoulder[1] + 30 * Math.cos(a)];
      return { shoulder, elbow, wrist: [elbow[0] + 27 * Math.sin(b), elbow[1] + 27 * Math.cos(b)] };
    }
    const drive = Number.isFinite(scene.armDrive)
        ? scene.armDrive
        : Math.sin((scene.p ?? 0) * Math.PI * 2),
      swing = far ? -drive : drive,
      a = swing * 0.6;
    const elbow = front
      ? [(far ? -1 : 1) * (11 + 3 * Math.abs(swing)), 27 - 4 * swing]
      : [Math.sin(a) * 36, Math.cos(a) * 36];
    // Same segment lengths as reaching arms (36 / 32), not a shortened swing arm.
    const wrist = front
      ? [(far ? -1 : 1) * (5 + 2 * Math.abs(swing)), 52 - 16 * swing]
      : [elbow[0] + Math.cos(a) * 31, elbow[1] - Math.sin(a) * 31];
    return {
      shoulder,
      elbow: add(shoulder, rotate(elbow, angle)),
      wrist: add(shoulder, rotate(wrist, angle)),
    };
  }
  // Half-widths: thigh, knee, calf and ankle (or upper arm, elbow, forearm, wrist).
  // Half-widths [t, front, back] from typical adult proportions.
  const LEG = {
    upper: [
      [0, 9.6, 11.4],
      [0.16, 11.6, 11.6],
      [0.42, 12, 10],
      [0.76, 9.6, 8],
      [1, 7, 6.6],
    ],
    lower: [
      [0, 6.9, 6.8],
      [0.2, 6.6, 8.8],
      [0.42, 6.1, 7.8],
      [0.78, 4.3, 4.4],
      [1, 3.8, 4.1],
    ],
  };
  const ARM = {
    upper: [
      [0, 7.4, 7.4],
      [0.18, 7.6, 7],
      [0.42, 5.5, 5.6],
      [0.66, 6.2, 5.9],
      [1, 4.4, 4.6],
    ],
    lower: [
      [0, 4.6, 4.5],
      [0.26, 5.9, 5],
      [0.72, 3.9, 3.6],
      [1, 3, 2.8],
    ],
  };
  // Foot outline around the ankle centre: x forward, y down, sole at y=10.2.
  const FOOT = [
    [-4.2, -4],
    [-6.6, 2.6],
    [-6.4, 7.6],
    [-3.6, 10.2],
    [6, 10.2],
    [15.5, 10.1],
    [20.2, 9.2],
    [19.6, 6.6],
    [15, 5.2],
    [8.4, 2.4],
    [4, -1.6],
    [4.2, -4],
  ];
  // Toe crease, toe split and the ankle bone, in the same frame as FOOT.
  const FOOT_LINES = [
    [
      [14.4, 5.4],
      [15.6, 7.6],
      [15.3, 10],
    ],
    [
      [18.2, 7],
      [19, 8.3],
      [18.6, 9.7],
    ],
    [
      [-1.2, -0.4],
      [0.2, -1.5],
      [1.5, -0.3],
    ],
  ];
  /** Lowest point of any planted foot (the floor under the figure), or null. */
  function groundLevel(scene) {
    let floor = null;
    for (const side of ["right", "left"]) {
      const l = scene[side];
      if (!l.contact || !point(l.ankle)) continue;
      const a = footAngle(l);
      for (const p of FOOT) {
        const y = add(l.ankle, rotate(p, a))[1];
        if (floor === null || y > floor) floor = y;
      }
    }
    return floor;
  }
  /** Anatomy lines on a side-view leg: quadriceps separation, the teardrop
   * of the inner quad above the knee, hamstring edge, calf and shin. */
  function legLines(hip, knee, ankle) {
    const T = (t, off) => onSegment(hip, knee, t, off),
      S = (t, off) => onSegment(knee, ankle, t, off);
    return [
      [T(0.2, -5.6), T(0.5, -6.8), T(0.8, -4.6)],
      [T(0.74, -9.6), T(0.88, -8.4), T(0.96, -5.6)],
      [T(0.3, 6.4), T(0.55, 6.8), T(0.78, 5)],
      [S(0.1, 6.2), S(0.32, 6.6), S(0.52, 3.6)],
      [S(0.18, -3.4), S(0.5, -3.2), S(0.84, -2.4)],
    ];
  }
  /** Front view: the inner contour of a leg, which would otherwise vanish
   * where both legs merge into one silhouette below the pelvis. */
  function innerLeg(hip, knee, ankle, medial) {
    if (!medial) return [];
    const T = (t) => onSegment(hip, knee, t, medial * widthAt(LEG.upper, t)),
      S = (t) => onSegment(knee, ankle, t, medial * widthAt(LEG.lower, t));
    return [
      [T(0.2), T(0.45), T(0.7), T(0.95)],
      [S(0.05), S(0.3), S(0.6), S(0.9)],
    ];
  }
  /** Anatomy lines on a side-view arm: the deltoid's lower border, the
   * biceps/triceps groove and the forearm flexor edge. */
  function armLines(shoulder, elbow, wrist) {
    const U = (t, off) => onSegment(shoulder, elbow, t, off),
      F = (t, off) => onSegment(elbow, wrist, t, off);
    return [
      [U(0.08, -6.4), U(0.3, -3.6), U(0.44, 0), U(0.3, 3.8), U(0.1, 6.2)],
      [U(0.52, 0.6), U(0.7, 0.8), U(0.88, 0.4)],
      [F(0.12, -1.8), F(0.4, -1.6), F(0.66, -0.6)],
    ];
  }
  /** Inner elbow crease, only once the elbow is visibly bent. */
  function elbowCrease(shoulder, elbow, wrist) {
    if (flexion(shoulder, elbow, wrist) < 25) return null;
    const u = unit(shoulder, elbow),
      v = unit(elbow, wrist),
      front = scale(normal(u), -1),
      c = add(elbow, scale(front, 2.6));
    return [add(c, scale(u, -2.4)), add(c, scale(front, 0.8)), add(c, scale(v, 2.4))];
  }
  /** Kneecap: a soft arc over the front of the knee. */
  function kneecap(hip, knee, ankle) {
    if (flexion(hip, knee, ankle) < 20) return null;
    const u = unit(hip, knee),
      v = unit(knee, ankle),
      front = scale(normal(u), -1),
      frontShin = scale(normal(v), -1);
    return [
      add(knee, add(scale(front, 4.4), scale(u, -4.2))),
      add(knee, scale(unit([0, 0], add(front, frontShin)), 6.2)),
      add(knee, add(scale(frontShin, 4.2), scale(v, 3.4))),
    ];
  }
  /** Ankle angle between the shin and the foot, kept in an anatomical range
   * whenever the foot is in the air; a planted foot keeps its pose angle. */
  function footAngle(l) {
    const phase = Math.max(0, Math.min(1, ((l.local ?? 0) - 0.34) / 0.66));
    const wanted = Number.isFinite(l.footAngle)
      ? l.footAngle
      : l.contact
        ? 0
        : -16 * Math.sin(Math.PI * phase);
    if (l.contact || !point(l.knee) || !point(l.ankle)) return wanted;
    const up = unit(l.ankle, l.knee),
      shin = (Math.atan2(up[1], up[0]) * 180) / Math.PI;
    // Foot direction relative to the shin pointing up: 90 is neutral,
    // ~70 full dorsiflexion, ~145 full plantar flexion.
    let rel = (((wanted - shin) % 360) + 360) % 360;
    if (rel > 180) rel -= 360;
    const sign = rel < 0 ? -1 : 1,
      clamped = Math.max(70, Math.min(145, Math.abs(rel)));
    return shin + sign * clamped;
  }
  /** Bare anatomical foot: heel, arch, ball and toes in one smooth contour. */
  // Foot seen from the front: ankle, instep and toes foreshortened.
  const FOOT_FRONT = [
    [-3.8, -3],
    [-4.4, 3],
    [-6, 7.6],
    [-5.2, 10.2],
    [5.2, 10.2],
    [6, 7.6],
    [4.4, 3],
    [3.8, -3],
  ];
  const FOOT_FRONT_LINES = [
    [
      [-2.6, 8],
      [-2.8, 10],
    ],
    [
      [0, 8.2],
      [0, 10.1],
    ],
    [
      [2.6, 8],
      [2.8, 10],
    ],
  ];
  function shoe(l, far = false, front = false) {
    return (
      `<g class="bw-human-shoe bw-human-foot" transform="translate(${xy(l.ankle)}) rotate(${fmt(front ? 0 : footAngle(l))})" fill="${colours.shoe}">` +
      path(smoothClosed(front ? FOOT_FRONT : FOOT)) +
      details(front ? FOOT_FRONT_LINES : FOOT_LINES, far) +
      "</g>"
    );
  }
  function leg(scene, side, front) {
    const l = scene[side],
      far = side === "left";
    let hip = l.hip ?? scene.hip,
      knee = l.knee,
      medial = 0;
    // Front view: each thigh starts at its own hip joint, not the pelvis
    // centre, so the legs stay two legs instead of one merged column.
    if (front && !l.hip) {
      const other = scene[far ? "right" : "left"],
        dx = l.knee[0] + l.ankle[0] - other.knee[0] - other.ankle[0],
        sign = Math.abs(dx) > 0.5 ? Math.sign(dx) : far ? 1 : -1;
      hip = add(scene.hip, rotate([sign * 6.8, 0], scene.torsoAngle ?? 0));
      medial = sign;
    }
    // Planted, straight-legged holds (plank, push-up, side plank, row) place
    // the far foot a few units over as a depth cue. Solving the far knee to
    // that shorter reach folded it through the floor, so draw the far leg as
    // the near leg shifted by the same offset instead.
    const near = scene.right;
    if (
      far &&
      !front &&
      l.contact &&
      near.contact &&
      !l.hip &&
      Math.abs(l.ankle[1] - near.ankle[1]) < 2 &&
      Math.abs(l.ankle[0] - near.ankle[0]) <= 12 &&
      flexion(scene.hip, near.knee, near.ankle) < 14 &&
      flexion(scene.hip, l.knee, l.ankle) > flexion(scene.hip, near.knee, near.ankle) + 10
    ) {
      const shift = add(l.ankle, scale(near.ankle, -1));
      hip = add(scene.hip, shift);
      knee = add(near.knee, shift);
    }
    return (
      `<g class="bw-human-leg bw-human-leg-${side}" fill="${far ? colours.farSkin : colours.skin}" stroke="${far ? "#7c8e9d" : colours.ink}">` +
      limb(hip, knee, l.ankle, LEG, front) +
      (front
        ? details(innerLeg(hip, knee, l.ankle, medial), far)
        : details(legLines(hip, knee, l.ankle), far)) +
      muscleLines(hip, knee, l.ankle, "leg", far, scene, side) +
      (front ? "" : details([kneecap(hip, knee, l.ankle)].filter(Boolean), far)) +
      shoe(l, far, front) +
      "</g>"
    );
  }
  function arm(scene, side, angle, front) {
    const { shoulder, elbow, wrist } = armPoints(scene, side, angle, front),
      far = side === "left";
    const supported = point(scene.handTargets?.[side]) || !!scene.arms?.[side];
    // A supporting hand at floor level lies flat, fingers forward, palm on
    // the ground; other reaching hands open along the forearm; swinging arms
    // carry a relaxed fist.
    const floor = groundLevel(scene),
      flat =
        supported && !front && floor !== null && floor - wrist[1] > -2 && floor - wrist[1] < 11;
    const axis = flat ? [1, 0] : unit(elbow, wrist),
      root = flat ? [wrist[0] - 1, floor - 4] : wrist;
    return (
      `<g class="bw-human-arm bw-human-arm-${side}" fill="${far ? colours.farSkin : colours.skin}" stroke="${far ? "#7c8e9d" : colours.ink}">` +
      limb(shoulder, elbow, wrist, ARM, front) +
      (front ? "" : details(armLines(shoulder, elbow, wrist), far)) +
      muscleLines(shoulder, elbow, wrist, "arm", far, scene, side) +
      details([elbowCrease(shoulder, elbow, wrist)].filter(Boolean), far) +
      handShape(root, axis, supported ? "open" : "fist", far) +
      "</g>"
    );
  }
  // Side-view head facing +x: cranium, brow, nose, lips, chin and jaw.
  const HEAD_SIDE = [
    [0, -109],
    [7.6, -107],
    [11.2, -101.6],
    [12.4, -96.8],
    [11.8, -94.6],
    [14.4, -89.8],
    [12.4, -88.2],
    [12.9, -86.1],
    [12.4, -84.7],
    [12.7, -83.4],
    [11.6, -81.9],
    [12, -79.6],
    [9.4, -77.3],
    [4.6, -78.2],
    [0.6, -81.4],
    [-6.4, -84.8],
    [-11.4, -90],
    [-12.6, -97.2],
    [-9.4, -105.4],
  ];
  // Short hair: a cap over the crown down to the nape, cut out around the ear.
  const HAIR_SIDE = [
    [11, -102.6],
    [8.4, -108],
    [0, -110.6],
    [-10, -106.4],
    [-13.8, -97.4],
    [-12.6, -89.4],
    [-7.8, -85],
    [-3.6, -87.8],
    [-1.6, -92.2],
    [3.4, -92.6],
    [4.8, -89.4],
    [5.4, -97.6],
    [9, -100.6],
  ];
  const HAIR_FRONT = [
    [-11.2, -94.6],
    [-11.8, -102],
    [-7.2, -108.8],
    [0, -110.4],
    [7.2, -108.8],
    [11.8, -102],
    [11.2, -94.6],
    [9.8, -97.4],
    [6, -101.4],
    [0, -102.4],
    [-6, -101.4],
    [-9.8, -97.4],
  ];
  const HEAD_FRONT = [
    [0, -108.4],
    [7.6, -106.6],
    [10.8, -100],
    [10.6, -93],
    [9.4, -86.6],
    [6.6, -79.6],
    [0, -75.8],
    [-6.6, -79.6],
    [-9.4, -86.6],
    [-10.6, -93],
    [-10.8, -100],
    [-7.6, -106.6],
  ];
  // Back of the head: hair down to the nape.
  const HAIR_BACK = [
    [-11, -89.6],
    [-11.6, -100],
    [-7.8, -107.8],
    [0, -110.2],
    [7.8, -107.8],
    [11.6, -100],
    [11, -89.6],
    [7, -85.2],
    [0, -84.4],
    [-7, -85.2],
  ];
  const HAIR_FILL = "#52626f";
  const hair = (ps, map = (p) => p) =>
    `<path class="bw-human-hair" d="${smoothClosed(ps.map(map))}" fill="${HAIR_FILL}"/>`;
  const FACE_SIDE = [
    [
      [-0.4, -92],
      [2.6, -91.6],
      [2.8, -87.4],
      [0.4, -86.6],
    ],
    [
      [7.8, -95],
      [9.4, -95.6],
      [10.8, -94.9],
    ],
    [
      [8.6, -97.6],
      [10.4, -98.4],
      [12, -97.8],
    ],
    [
      [10.4, -84.9],
      [11.6, -84.6],
      [12.5, -84.8],
    ],
  ];
  const FACE_FRONT = [
    [
      [-6.2, -94],
      [-4.2, -94.9],
      [-2.4, -94],
    ],
    [
      [6.2, -94],
      [4.2, -94.9],
      [2.4, -94],
    ],
    [
      [0.4, -92.4],
      [1, -88.6],
      [-0.6, -88.1],
    ],
    [
      [-2.8, -83.8],
      [0, -83.2],
      [2.8, -83.8],
    ],
    [
      [-10.4, -95.4],
      [-12.2, -93.4],
      [-11.8, -88.8],
      [-10.2, -88],
    ],
    [
      [10.4, -95.4],
      [12.2, -93.4],
      [11.8, -88.8],
      [10.2, -88],
    ],
  ];
  /** Head and neck: skull, face profile and jaw as one smooth outline, with
   * light lines for the ear, eye and mouth. */
  function face(front) {
    const neck = path(
      smoothClosed(
        front
          ? [
              [-6.4, -84],
              [-6.8, -72],
              [-10.5, -65.4],
              [0, -62.5],
              [10.5, -65.4],
              [6.8, -72],
              [6.4, -84],
            ]
          : [
              [-6.6, -86],
              [-7.2, -76],
              [-9.6, -68],
              [0, -62],
              [9.4, -64.6],
              [7.8, -72],
              [7.4, -79.4],
              [3, -81],
            ],
      ),
      'fill="#fff"',
    );

    return (
      neck +
      (front
        ? path(smoothClosed(HEAD_FRONT), 'fill="#fff"') +
          hair(HAIR_FRONT) +
          details(FACE_FRONT, false)
        : path(smoothClosed(HEAD_SIDE), 'fill="#fff"') +
          hair(HAIR_SIDE) +
          details(FACE_SIDE, false))
    );
  }
  /** One continuous trunk outline: shoulders, chest, waist and pelvis,
   * as a smooth curve through anatomical landmarks (+x is the chest side). */
  function trunkPath(front, spineCurve = 0) {
    if (front) {
      const half = [
        [5.5, -67],
        [15, -66],
        [22, -61.5],
        [21.5, -52],
        [18.5, -41],
        [15.2, -28],
        [15, -18],
        [17, -8],
        [15.5, 2],
        [8, 7.5],
      ];
      return smoothClosed(half.concat([[0, 8.6]], half.map(([x, y]) => [-x, y]).reverse()));
    }
    const k = spineCurve;
    return smoothClosed([
      [8, -66.4],
      [12, -63.4],
      [14.8, -58],
      [16.4, -51],
      [15.2, -45.4],
      [13.2, -40],
      [11.6, -32],
      [11, -22],
      [11.8, -12],
      [10, -1.4],
      [5, 5.4],
      [-1.4, 7.4],
      [-9.6, 6.6],
      [-15, -0.6],
      [-14.2, -9.4],
      [-11 - k, -19.6],
      [-13.4 - k, -31],
      [-16.2, -45],
      [-15.4, -56],
      [-12.4, -62.4],
      [-8.6, -66.4],
    ]);
  }
  function torso(scene, angle, front) {
    const expansion = 1 + Math.max(0, scene.breath ?? 0) * 0.015;
    return (
      `<g class="bw-human-torso" transform="translate(${xy(scene.hip)}) rotate(${fmt(angle)})"><g transform="translate(0 -67) rotate(${fmt(scene.headAngle ?? 0)}) scale(1) translate(0 67)">${face(front)}</g><g transform="scale(${fmt(expansion)} 1)">` +
      path(trunkPath(front, scene.spineCurve ?? 0), `fill="${colours.shirt}"`) +
      details(
        front
          ? [
              [
                [-3.6, -63],
                [-10, -64.6],
                [-17, -62.6],
              ],
              [
                [3.6, -63],
                [10, -64.6],
                [17, -62.6],
              ],
              // Pectorals, linea alba, abdominal segments and the obliques'
              // V toward the groin.
              [
                [-17, -52],
                [-9, -44.6],
                [-1.2, -46.6],
              ],
              [
                [17, -52],
                [9, -44.6],
                [1.2, -46.6],
              ],
              [
                [0, -50],
                [0, -30],
                [0, -12],
              ],
              [
                [-7.6, -35],
                [0, -34],
                [7.6, -35],
              ],
              [
                [-7.4, -26],
                [0, -25],
                [7.4, -26],
              ],
              [
                [-13.4, -14],
                [-8.6, -6],
                [-3, 2],
              ],
              [
                [13.4, -14],
                [8.6, -6],
                [3, 2],
              ],
            ]
          : [
              // Clavicle, lower pectoral edge, lat edge from the armpit,
              // the abdominal wall's outer border and the iliac crest.
              [
                [9.6, -63.6],
                [7.4, -61.6],
                [3.8, -61.2],
              ],
              [
                [15.2, -45.6],
                [11, -44],
                [6.4, -46.6],
              ],
              [
                [-6.4, -54],
                [-9.6, -42],
                [-9, -30],
              ],
              [
                [10.2, -38],
                [7.6, -27],
                [8.2, -14],
              ],
              [
                [-8, -14.6],
                [0, -13.2],
                [7.6, -9],
              ],
            ],
        false,
      ) +
      torsoMuscles(scene, (p) => p, false, !front) +
      "</g></g>"
    );
  }
  function points(scene) {
    const angle = scene.torsoAngle ?? 0,
      front = scene.view === "front",
      result = [];
    for (const p of [
      [-23, -110],
      [23, -110],
      [-25, -64],
      [25, -64],
      [-24, 15],
      [24, 15],
    ])
      result.push(add(scene.hip, rotate(p, angle)));
    for (const side of ["right", "left"]) {
      const l = scene[side],
        a = armPoints(scene, side, angle, front);
      for (const p of [l.knee, l.ankle, a.shoulder, a.elbow, a.wrist])
        for (const d of [
          [-12, -12],
          [12, 12],
        ])
          result.push(add(p, d));
      for (const p of [
        [-9, -6],
        [18, -6],
        [-7, 11],
        [16, 11],
      ])
        result.push(add(l.ankle, rotate(p, l.footAngle ?? 0)));
    }
    return result;
  }
  /** One body part group as a single silhouette: a heavier ink pass underneath,
   * then the same shapes in white without strokes, so overlapping segments of
   * one depth layer merge without inner seams. Muscles keep their own stroke. */
  function seamless(svg) {
    // Plain SVG attributes, no stylesheet: the same markup works inside static
    // snapshot files as well as in the player.
    const ink = svg.replace(
      /class="(bw-muscle-traces|bw-human-detail)/g,
      'display="none" class="$1',
    );
    const fill = svg.replace(/stroke="(#7c8e9d|#344b5e)"/g, 'stroke="none"');
    return `<g class="bw-silhouette-ink" stroke-width="1.9">${ink}</g><g class="bw-silhouette-fill" stroke="none">${fill}</g>`;
  }
  function draw(scene) {
    if (
      !scene ||
      !point(scene.hip) ||
      !scene.right ||
      !scene.left ||
      ![scene.right.knee, scene.right.ankle, scene.left.knee, scene.left.ankle].every(point)
    )
      return "";
    const front = scene.view === "front",
      angle = Number.isFinite(scene.torsoAngle) ? scene.torsoAngle : 0,
      mx = scene.mirrorX ?? scene.hip[0];
    const mirror = scene.facing < 0 ? ` transform="translate(${fmt(mx * 2)} 0) scale(-1 1)"` : "";
    const farArm = arm(scene, "left", angle, front),
      nearArm = arm(scene, "right", angle, front),
      farLeg = leg(scene, "left", front),
      nearLeg = leg(scene, "right", front);
    const waist = `<g transform="translate(${xy(scene.hip)}) rotate(${fmt(angle)})" fill="#fff" stroke="none">${path("M-12,-12Q0,-9 11.6,-12L11.4,3Q3,9.6 -6,7Q-11.4,4 -12,-12Z")}</g>`;
    const layers = front
      ? seamless(farLeg + nearLeg + torso(scene, angle, true) + waist) +
        seamless(farArm) +
        seamless(nearArm)
      : seamless(farArm) +
        seamless(farLeg) +
        seamless(torso(scene, angle, false) + nearLeg + waist) +
        seamless(nearArm);
    return `<g class="bw-human-athlete bw-human-outline bw-human-natural bw-human-sketch bw-human-${front ? "front" : "side"}" stroke="${colours.ink}" stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round"${mirror}>${layers}</g>`;
  }
  scope.drawBallwiseAthlete = draw;
  scope.BWDrawHuman = {
    draw,
    seamless,
    fmt,
    armPoints,
    points,
    geometry: {
      limb,
      segment,
      smoothClosed,
      footAngle,
      LEG,
      ARM,
      onSegment,
      legLines,
      armLines,
      FOOT,
      FOOT_LINES,
      HEAD_SIDE,
      HAIR_SIDE,
      HAIR_FRONT,
      HAIR_BACK,
      HEAD_FRONT,
      FACE_SIDE,
      FACE_FRONT,
      hair,
      details,
      handShape,
      muscleLines,
      torsoMuscles,
      belly,
      trunkPath,
    },
    muscles,
    style: "anatomical-outline-59",
    version: 59,
  };
})(typeof window === "object" ? window : globalThis);
