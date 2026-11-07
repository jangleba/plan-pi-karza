/* Fixed orthographic teaching views. Body, grips, supports and equipment share
 * world coordinates: X anterior, Y down, Z lateral. These are authored examples,
 * not a measurement or an individual athlete's prescribed range of motion. */
(function (scope) {
  "use strict";
  const H = scope.BWDrawHuman,
    A = scope.BWAnim,
    G = H.geometry;
  const rad = Math.PI / 180,
    F = 264;
  const add = (a, b) => a.map((v, i) => v + b[i]);
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const mul = (a, t) => a.map((v) => v * t);
  const dot = (a, b) => a.reduce((v, x, i) => v + x * b[i], 0);
  const length = (a) => Math.hypot(...a);
  const unit = (a) => mul(a, 1 / (length(a) || 1));
  const mix = (a, b, t) => add(a, mul(sub(b, a), t));
  const smooth = A.math.smooth;
  const rep = (p) => (p < 0.44 ? smooth(p / 0.44) : p < 0.56 ? 1 : 1 - smooth((p - 0.56) / 0.44));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const f = (n) => Number(n).toFixed(3),
    xy = (a) => a.map(f).join(",");
  const path = (d, fill = "#fff", extra = "") => `<path d="${d}" fill="${fill}" ${extra}/>`;
  function local(s, p) {
    const a = (s.torsoAngle || 0) * rad;
    return [
      s.hip[0] + p[0] * Math.cos(a) - p[1] * Math.sin(a),
      s.hip[1] + p[0] * Math.sin(a) + p[1] * Math.cos(a),
      p[2] || 0,
    ];
  }
  function project(p, c) {
    const t = c.yaw * rad,
      e = c.elevation * rad,
      x = p[0] - 160,
      y = p[1] - F,
      z = p[2];
    return [
      160 + x * Math.cos(t) + z * Math.sin(t),
      F + y * Math.cos(e) + (-x * Math.sin(t) + z * Math.cos(t)) * Math.sin(e),
    ];
  }
  function depth(p, c) {
    const t = c.yaw * rad,
      e = c.elevation * rad;
    return (
      -p[0] * Math.sin(t) * Math.cos(e) - p[1] * Math.sin(e) + p[2] * Math.cos(t) * Math.cos(e)
    );
  }
  // Two-bone IK with a world-space pole. Bone lengths stay constant even when
  // foreshortened on screen; the pole defines the anatomical bend direction.
  function ik(a, target, L1, L2, pole, minDistance = 0) {
    const v = sub(target, a),
      d = clamp(length(v), Math.max(Math.abs(L1 - L2) + 0.01, minDistance), L1 + L2 - 0.2),
      u = unit(v);
    let n = sub(pole, mul(u, dot(pole, u)));
    if (length(n) < 0.001) n = sub([0, 0, 1], mul(u, u[2]));
    n = unit(n);
    const q = (L1 * L1 - L2 * L2 + d * d) / (2 * d),
      h = Math.sqrt(Math.max(0, L1 * L1 - q * q));
    return {
      joint: add(add(a, mul(u, q)), mul(n, h)),
      end: add(a, mul(u, d)),
      error: Math.abs(length(v) - d),
    };
  }
  const selected = new Set(["squat", "hinge", "split", "step_up", "carry", "pull"]);
  function policy(c) {
    if (selected.has(c.family) && c.equipment !== "flywheel") return true;
    return (
      (c.family === "press" &&
        !["push_up", "pike_push_up", "incline_push_up"].includes(c.variant)) ||
      c.family === "power_lift" ||
      c.variant === "hip_thrust" ||
      c.variant === "pallof_press" ||
      (c.family === "jump" && ["barbell_back", "dumbbells", "trapbar"].includes(c.equipment))
    );
  }
  function body(s, c) {
    const r = rep(s.p),
      id = c.variant;
    // Correct physical support geometry before projecting the illustration.
    if (id === "hip_thrust") {
      const y = 240 - 42.6 * r,
        dy = y - 197.4;
      s.hip = [130 + Math.sqrt(61 * 61 - dy * dy), y];
      s.torsoAngle = Math.atan2(130 - s.hip[0], s.hip[1] - 197.4) / rad;
      s.right.ankle = [250, 253];
      s.left.ankle = [250, 253];
    }
    if (id === "one_arm_dumbbell_row") {
      s.hip = [180, 155];
      s.left.knee = [148, 201.309];
      s.left.ankle = [92, 202];
    }
    if (id === "barbell_deadlift") s.hip[1] += 0.55 * (1 - r);
    if (id === "kickstand_romanian_deadlift") s.hip[1] += 1;
    if (id === "bodyweight_row") {
      const b = (20 + 18 * r) * rad;
      s.hip[0] += Math.cos(b);
      s.hip[1] += Math.sin(b);
    }
    if (id === "clean_pull_from_hang")
      s.hip[1] -=
        5 * (s.p < 0.38 ? smooth(s.p / 0.38) : s.p < 0.52 ? 1 : 1 - smooth((s.p - 0.52) / 0.48));
    // From the other quarter a hip-thrust plate hides the head and shoulder
    // support. The opposite, fixed view exposes the bench contact throughout.
    const rear =
      ["barbell_back", "barbell_band", "pins"].includes(c.equipment) || id === "hip_thrust";
    const sp = {
      camera: {
        yaw: rear ? 38 : -35,
        elevation: 10,
        view: rear ? "rear-quarter" : "front-quarter",
      },
      joints: {},
      gear: [],
      grips: {},
      config: c,
    };
    s.spatial = sp;
    const bilateral =
      (["squat", "hinge", "press", "pull", "power_lift"].includes(c.family) &&
        !c.unilateral &&
        ![
          "bodyweight_row",
          "one_arm_dumbbell_row",
          "dumbbell_bench_press",
          "lat_pulldown",
        ].includes(id)) ||
      id === "hip_thrust" ||
      c.family === "jump";
    const avg = (s.right.ankle[0] + s.left.ankle[0]) / 2;
    for (const [side, sign] of [
      ["left", -1],
      ["right", 1],
    ]) {
      const l = s[side],
        z = sign * (c.family === "squat" ? 21 : 19);
      const hip = [s.hip[0], s.hip[1], sign * 10];
      let ankle = [bilateral ? avg : l.ankle[0], l.ankle[1], z],
        footAngle = l.footAngle || 0;
      if (id === "single_leg_romanian_deadlift" && side === "left") l.contact = r < 1e-6;
      if (id === "clean_pull_from_hang") {
        const pull =
          s.p < 0.38 ? smooth(s.p / 0.38) : s.p < 0.52 ? 1 : 1 - smooth((s.p - 0.52) / 0.48);
        footAngle = 22 * pull;
        ankle[1] = F - A.math.sole(footAngle).lowest;
      }
      if (c.family === "step_up" && side === "left") {
        ankle[1] -= r;
        l.contact = r < 1e-6;
      }
      if (id === "bulgarian_split_squat" && side === "left") {
        footAngle = 35;
        ankle = [86, 222 - A.math.sole(footAngle).lowest, sign * 19];
      }
      if (id === "one_arm_dumbbell_row" && side === "left") ankle = [92, 201.309, -19];
      const k = ik(hip, ankle, 57, 56, [1, 0, sign * 0.12]);
      let knee = k.joint;
      if (id === "one_arm_dumbbell_row" && side === "left") {
        // A horizontal shin on the bench; hip and knee remain physically linked.
        knee = [148, 201.309, -19];
        ankle = [92, 201.309, -19];
      }
      sp.joints[side] = {
        hip,
        knee,
        ankle,
        footAngle,
        contact: l.contact,
        surface: l.contactSurface,
      };
    }
    sp.hip = [s.hip[0], s.hip[1], 0];
    sp.neck = local(s, [0, -67, 0]);
    sp.head = local(s, [0, -83, 0]);
    if (id === "hip_thrust") sp.head = add(sp.neck, [0, -16, 0]);
    for (const [side, sign] of [
      ["left", -1],
      ["right", 1],
    ]) {
      const old = H.baseArmPoints(s, side, s.torsoAngle || 0, s.view === "front");
      const shoulder = local(s, [0, -61, sign * 18]);
      const target = [old.wrist[0], old.wrist[1], sign * 21];
      const k = ik(shoulder, target, 36, 32, [1, 0.1, sign * 0.3], 15.3);
      Object.assign(sp.joints[side], { shoulder, elbow: k.joint, wrist: k.end });
    }
    return sp;
  }
  function grip(s, side, target, pole = [1, 0.2, 0]) {
    const sp = s.spatial,
      j = sp.joints[side];
    const k = ik(j.shoulder, target, 36, 32, pole, 15.3);
    j.elbow = k.joint;
    j.wrist = k.end;
    sp.grips[side] = { target: [...target], error: k.error };
  }
  function bar(s, at, kind = "barbell", gripWidth = 34) {
    s.spatial.gear.push({ kind, at, axis: [0, 0, 1], half: 130, plateZ: 108, radius: 27 });
    if (kind === "barbell")
      for (const [side, sign] of [
        ["left", -1],
        ["right", 1],
      ])
        grip(
          s,
          side,
          add(at, [0, 0, sign * gripWidth]),
          s.spatial.config.equipment === "barbell_front"
            ? [1, 0.1, sign * 0.6]
            : [-0.5, 1, sign * 0.6],
        );
    return at;
  }
  function bench(s, min, max) {
    s.spatial.gear.push({ kind: "bench", min, max });
  }
  function equipment(s, c) {
    const sp = s.spatial,
      id = c.variant,
      eq = c.equipment,
      r = rep(s.p);
    let at;
    if (
      (c.family === "squat" && ["barbell_back", "barbell_band", "pins"].includes(eq)) ||
      (c.family === "jump" && eq === "barbell_back")
    ) {
      at = bar(s, local(s, [-13, -58, 0]));
      sp.support = { kind: "upper-back", at, local: [-13, -58, 0] };
      if (eq === "barbell_band")
        for (const sign of [-1, 1])
          sp.gear.push({ kind: "band", a: [159, F, sign * 82], b: add(at, [0, 0, sign * 82]) });
      if (eq === "pins")
        for (const sign of [-1, 1]) {
          const a = [at[0], F, sign * 83],
            b = [at[0], 50, sign * 83];
          sp.gear.push(
            { kind: "post", a, b },
            { kind: "post", a: add(at, [-25, 2, sign * 83]), b: add(at, [25, 2, sign * 83]) },
          );
        }
    } else if (c.family === "squat" && eq === "barbell_front") {
      at = bar(s, local(s, [12, -60, 0]), "barbell", 34);
      sp.support = { kind: "front-rack", at, local: [12, -60, 0] };
    } else if (c.family === "hinge" && eq === "barbell") {
      const sh = local(s, [0, -61, 0]);
      at = add(sh, [0, Math.sqrt(67.8 ** 2 - 10 ** 2), 0]);
      bar(s, at, "barbell", 28);
    } else if (eq === "trapbar") {
      const sh = local(s, [0, -61, 0]);
      at = add(sh, [0, Math.sqrt(67.8 ** 2 - 12 ** 2), 0]);
      sp.gear.push({ kind: "trapbar", at, axis: [0, 0, 1], radius: 27 });
      for (const [side, sign] of [
        ["left", -1],
        ["right", 1],
      ])
        grip(s, side, add(at, [0, 0, sign * 30]), [1, 0, 0]);
    } else if (id === "hip_thrust") {
      bench(s, [79, 205.4, -38], [138, 213.4, 38]);
      at = local(s, [13, 0, 0]);
      bar(s, at, "barbell", 32);
      sp.gear.push({ kind: "pad", at, axis: [0, 0, 1] });
      sp.support = { kind: "hips", at, local: [13, 0, 0] };
    } else if (id === "push_press") {
      const up =
        s.p < 0.17
          ? 0
          : s.p < 0.48
            ? smooth((s.p - 0.17) / 0.31)
            : s.p < 0.65
              ? 1
              : 1 - smooth((s.p - 0.65) / 0.35);
      at = local(s, [12 * (1 - up) + 16 * Math.sin(Math.PI * up), -60 - 67 * up, 0]);
      bar(s, at, "barbell", 34 - 6 * up);
      for (const [side, sign] of [
        ["left", -1],
        ["right", 1],
      ])
        grip(s, side, add(at, [0, 0, sign * (34 - 6 * up)]), [1, 0.1, sign * 0.4]);
    } else if (c.family === "power_lift" && eq === "barbell") {
      const pull =
        s.p < 0.38 ? smooth(s.p / 0.38) : s.p < 0.52 ? 1 : 1 - smooth((s.p - 0.52) / 0.48);
      const catchWeight =
        id === "power_clean"
          ? smooth(clamp((s.p - 0.36) / 0.14, 0, 1)) *
            (1 - smooth(clamp((s.p - 0.72) / 0.14, 0, 1)))
          : 0;
      const sh = local(s, [0, -61, 0]);
      at = mix(
        add(sh, [0, Math.sqrt(67.8 ** 2 - 10 ** 2) - 3 * pull, 0]),
        local(s, [12, -60, 0]),
        catchWeight,
      );
      bar(s, at, "barbell", 28);
      for (const [side, sign] of [
        ["left", -1],
        ["right", 1],
      ])
        grip(s, side, add(at, [0, 0, sign * 28]), [1, 0.1, sign * 0.5]);
      if (id === "clean_pull_from_hang")
        s.phase =
          s.p < 0.38
            ? "Wyprost bioder i kolan · ramiona pozostają długie"
            : s.p < 0.52
              ? "Wzruszenie barkami · bez zarzutu na barki"
              : "Opuść sztangę blisko nóg do zawisu";
    } else if (id === "pull_up" || id === "bodyweight_row") {
      at = id === "pull_up" ? [160, 50, 0] : [120, 133, 0];
      sp.gear.push({ kind: "handle", at, axis: [0, 0, 1], half: 75 });
      for (const [side, sign] of [
        ["left", -1],
        ["right", 1],
      ])
        grip(s, side, add(at, [0, 0, sign * 31]), [1, 0.2, sign * 0.4]);
      for (const sign of [-1, 1])
        sp.gear.push({ kind: "post", a: add(at, [0, 0, sign * 75]), b: [at[0], F, sign * 75] });
    } else if (id === "lat_pulldown") {
      at = [171, 72 + 65 * r, 0];
      sp.gear.push({ kind: "pulldown", at, axis: [0, 0, 1] });
      for (const [side, sign] of [
        ["left", -1],
        ["right", 1],
      ])
        grip(s, side, add(at, [5, 4, sign * 34]), [1, 0.1, sign * 0.4]);
      bench(s, [145, 207, -29], [190, 214, 29]);
      sp.gear.push(
        { kind: "cable", a: [171, 37, 0], b: at },
        { kind: "post", a: [105, F, -72], b: [105, 37, -72] },
        { kind: "post", a: [105, 37, -72], b: [171, 37, 0] },
      );
    } else if (id === "face_pull_band") {
      for (const [side, sign] of [
        ["left", -1],
        ["right", 1],
      ]) {
        const target = [221 - 50 * r, 83 - 7 * r, sign * (12 + 23 * r)];
        grip(s, side, target, [0, 0, sign]);
        sp.gear.push({ kind: "band", a: [282, 77, 0], b: target });
      }
    } else if (id === "pallof_press") {
      const target = [176 + 40 * r, 105, 0];
      for (const [side, sign] of [
        ["left", -1],
        ["right", 1],
      ])
        grip(s, side, add(target, [0, 0, sign * 3]), [1, 0.3, sign * 0.4]);
      sp.gear.push({ kind: "band", a: [176, 105, -120], b: target });
    }
    if (eq?.includes("dumbbell")) {
      if (id === "dumbbell_bench_press") bench(s, [72, 210, -27], [214, 218, 27]);
      if (id === "bulgarian_split_squat") bench(s, [61, 222, -36], [112, 230, 36]);
      if (id === "one_arm_dumbbell_row") {
        bench(s, [115, 205, -38], [273, 213, -5]);
        grip(s, "left", [244, 198, -19], [1, 0.1, -0.3]);
        const target = mix([242, 204, 24], [193, 163, 24], r);
        grip(s, "right", target, [1, 0.1, 0.1]);
      }
      for (const [side, sign] of [
        ["left", -1],
        ["right", 1],
      ]) {
        if (
          (eq === "bench_dumbbell" || eq === "one_dumbbell" || eq === "dumbbell") &&
          side === "left"
        )
          continue;
        if (id === "dumbbell_bench_press")
          grip(s, side, [125, 180 - 45 * r, sign * 31], [0, 0.6, sign]);
        if (id === "dumbbell_overhead_press")
          grip(
            s,
            side,
            local(s, [22 * (1 - r) + 18 * Math.sin(Math.PI * r), -50 - 78 * r, sign * 28]),
            [1, 0.1, sign * 0.6],
          );
        const axis = [
          "dumbbell_bench_press",
          "dumbbell_overhead_press",
          "romanian_deadlift_db",
          "kickstand_romanian_deadlift",
        ].includes(id)
          ? [0, 0, 1]
          : [1, 0, 0];
        sp.gear.push({ kind: "dumbbell", at: sp.joints[side].wrist, axis });
      }
    }
    if (eq === "kettlebell" || eq === "front_kettlebells") {
      if (eq === "front_kettlebells")
        for (const [side, sign] of [
          ["left", -1],
          ["right", 1],
        ])
          sp.gear.push({ kind: "kettlebell", at: sp.joints[side].wrist, axis: [0, 0, 1] });
      else {
        at =
          eq === "kettlebell" && c.family === "squat"
            ? local(s, [23, -44, 0])
            : mix(sp.joints.left.wrist, sp.joints.right.wrist, 0.5);
        for (const [side, sign] of [
          ["left", -1],
          ["right", 1],
        ])
          grip(s, side, add(at, [0, 0, sign * 6]), [0.3, 1, sign * 0.3]);
        sp.gear.push({ kind: "kettlebell", at, axis: [0, 0, 1] });
      }
    }
    if (c.family === "step_up")
      sp.gear.push({ kind: "box", min: [180, 225, -35], max: [237, F, 35] });
  }
  // Every primitive below is projected through the same camera. Depth sorting
  // permits the far sleeve/plate and near hand to occlude in the correct order.
  function ellipse(at, u, v, c) {
    const p = project(at, c),
      a = sub(project(add(at, u), c), p),
      b = sub(project(add(at, v), c), p),
      k = 0.55228475;
    const q = (x, y) => add(p, add(mul(a, x), mul(b, y)));
    return `M${xy(q(1, 0))}C${xy(q(1, k))} ${xy(q(k, 1))} ${xy(q(0, 1))}C${xy(q(-k, 1))} ${xy(q(-1, k))} ${xy(q(-1, 0))}C${xy(q(-1, -k))} ${xy(q(-k, -1))} ${xy(q(0, -1))}C${xy(q(k, -1))} ${xy(q(1, -k))} ${xy(q(1, 0))}Z`;
  }
  function hull(points) {
    const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const turn = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const half = (ps) => {
      const h = [];
      for (const p of ps) {
        while (h.length > 1 && turn(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
        h.push(p);
      }
      return h;
    };
    const a = half(sorted),
      b = half(sorted.reverse());
    return a.slice(0, -1).concat(b.slice(0, -1));
  }
  function softHull(points) {
    const h = hull(points),
      n = h.length,
      mid = (a, b) => mix(a, b, 0.5);
    let d = `M${xy(mid(h[n - 1], h[0]))}`;
    for (let i = 0; i < n; i++) d += `Q${xy(h[i])} ${xy(mid(h[i], h[(i + 1) % n]))}`;
    return d + "Z";
  }
  function worldBounds(s) {
    const sp = s.spatial,
      pts = [];
    const box = (at, r) => {
      for (const x of [-r, r])
        for (const y of [-r, r]) for (const z of [-r, r]) pts.push(add(at, [x, y, z]));
    };
    box(sp.head, 17);
    for (const j of Object.values(sp.joints))
      for (const key of ["hip", "knee", "ankle", "shoulder", "elbow", "wrist"])
        box(j[key], key === "ankle" ? 18 : 12);
    for (const g of sp.gear) {
      if (g.min) {
        pts.push(g.min, g.max, [g.min[0], g.min[1], g.max[2]], [g.max[0], g.min[1], g.min[2]]);
      } else if (g.a) pts.push(g.a, g.b);
      else if (g.kind === "barbell") {
        for (const sign of [-1, 1]) {
          box(add(g.at, [0, 0, sign * g.plateZ]), g.radius);
          pts.push(add(g.at, [0, 0, sign * g.half]));
        }
      } else if (g.kind === "trapbar") {
        box(g.at, 85);
      } else box(g.at, g.kind === "handle" ? 78 : g.kind === "pulldown" ? 60 : 20);
    }
    return pts.map((p) => project(p, sp.camera));
  }
  function draw(s) {
    if (!s.spatial) return H.baseDraw(s);
    const sp = s.spatial,
      c = sp.camera,
      layers = [],
      P = (p) => project(p, c);
    const layer = (at, svg) => layers.push({ z: depth(at, c), svg });
    const line = (a, b, w = 1, colour = "#6e879b") => {
      const n = Math.max(1, Math.ceil(length(sub(b, a)) / 12));
      for (let i = 0; i < n; i++) {
        const x = mix(a, b, i / n),
          y = mix(a, b, (i + 1) / n);
        layer(
          mix(x, y, 0.5),
          path(`M${xy(P(x))}L${xy(P(y))}`, "none", `stroke="${colour}" stroke-width="${w}"`),
        );
      }
    };
    const poly = (ps) => path("M" + ps.map((p) => xy(P(p))).join("L") + "Z", "#fff");
    const cuboid = (min, max) => {
      const [x, y, z] = min,
        [X, Y, Z] = max;
      const faces = [
        [
          [x, y, z],
          [X, y, z],
          [X, y, Z],
          [x, y, Z],
        ],
        [
          [x, y, Z],
          [X, y, Z],
          [X, Y, Z],
          [x, Y, Z],
        ],
        [
          [X, y, z],
          [X, Y, z],
          [X, Y, Z],
          [X, y, Z],
        ],
        [
          [x, y, z],
          [x, Y, z],
          [x, Y, Z],
          [x, y, Z],
        ],
      ];
      for (const face of faces)
        layer(
          face.reduce((a, p) => add(a, mul(p, 0.25)), [0, 0, 0]),
          poly(face),
        );
    };
    function plate(at, axis, r, thickness = 4) {
      const u = axis[2] ? [r, 0, 0] : [0, 0, r],
        v = [0, r, 0];
      const near = dot(axis, [-Math.sin(c.yaw * rad), 0, Math.cos(c.yaw * rad)]) > 0 ? 1 : -1;
      const back = add(at, mul(axis, (-near * thickness) / 2)),
        front = add(at, mul(axis, (near * thickness) / 2));
      layer(back, path(ellipse(back, u, v, c), "#fff", 'stroke="#879aaa" stroke-width=".65"'));
      layer(
        front,
        path(ellipse(front, u, v, c), "#fff", 'stroke="#456075" stroke-width=".9"') +
          path(
            ellipse(front, mul(u, 0.16), mul(v, 0.16), c),
            "none",
            'stroke="#8ea1af" stroke-width=".6"',
          ),
      );
    }
    for (const [side, sign] of [
      ["left", -1],
      ["right", 1],
    ]) {
      const j = sp.joints[side],
        far = sign < 0,
        legSvg =
          G.limb(P(j.hip), P(j.knee), P(j.ankle), G.LEG, true) +
          G.muscleLines(P(j.hip), P(j.knee), P(j.ankle), "leg", far, s, side);
      layer(
        mix(j.hip, j.ankle, 0.48),
        `<g class="bw-human-leg bw-human-leg-${side}" fill="#fff">${legSvg}</g>`,
      );
      const a = j.footAngle * rad;
      const shoePoint = (x, y, z = 0) =>
        add(j.ankle, [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z]);
      // Bare foot: the shared side-view foot contour, placed in 3D and projected.
      layer(
        add(j.ankle, [5, 5, 0]),
        '<g class="bw-human-shoe bw-human-foot">' +
          path(G.smoothClosed(G.FOOT.map(([x, y]) => P(shoePoint(x, y))))) +
          G.details(G.FOOT_LINES, far, ([x, y]) => P(shoePoint(x, y))) +
          "</g>",
      );
      const armSvg =
        G.limb(P(j.shoulder), P(j.elbow), P(j.wrist), G.ARM, true) +
        G.muscleLines(P(j.shoulder), P(j.elbow), P(j.wrist), "arm", far, s, side);
      layer(
        mix(j.shoulder, j.wrist, 0.55),
        `<g class="bw-human-arm bw-human-arm-${side}">${armSvg}</g>`,
      );
      // Hand with fingers, at the projected wrist along the projected forearm.
      const wrist2d = P(j.wrist),
        forearm = sub(wrist2d, P(j.elbow));
      layer(add(j.wrist, [0, 0, 1.8]), G.handShape(wrist2d, unit(forearm), "fist", far));
    }
    // Torso as overlapping slices between neighbouring cross-sections. Each
    // slice is convex, but their union keeps the waist, chest and pelvis shape
    // that a single convex hull flattened into a box.
    const sections = [
      [9, 5, 8],
      [5, 10, 13.5],
      [-2, 12, 15],
      [-10, 12.5, 14.8],
      [-22, 11, 12.6],
      [-36, 13.5, 16.5],
      [-50, 14, 20.5],
      [-58, 12, 21],
      [-63, 9, 15],
      [-66, 6.5, 8],
    ];
    // Outline from the extreme points of each projected cross-section,
    // measured across the projected spine: one smooth contour with waist,
    // chest and shoulders instead of a convex box.
    const spineTop = P(local(s, [0, -66, 0])),
      spineBottom = P(local(s, [0, 9, 0])),
      along = sub(spineTop, spineBottom),
      across = unit([-along[1], along[0]]);
    const leftSide = [],
      rightSide = [];
    for (const [y, rx, rz] of sections) {
      let lo = null,
        hi = null;
      for (let i = 0; i < 16; i++) {
        const q = P(
          local(s, [rx * Math.cos((i * Math.PI) / 8), y, rz * Math.sin((i * Math.PI) / 8)]),
        );
        const d = dot(q, across);
        if (!lo || d < lo.d) lo = { q, d };
        if (!hi || d > hi.d) hi = { q, d };
      }
      leftSide.push(lo.q);
      rightSide.push(hi.q);
    }
    const torsoShape = path(G.smoothClosed(leftSide.concat(rightSide.reverse())));
    const rear = c.view === "rear-quarter";
    let torso = torsoShape;
    torso += G.torsoMuscles(s, (p) => P(local(s, [rear ? -16 : 16, p[1], p[0]])), rear);
    layer(local(s, [0, -32, 0]), '<g class="bw-human-torso">' + torso + "</g>");
    const neckPoints = [];
    for (const [y, r] of [
      [-75, 4.6],
      [-64, 6.4],
    ])
      for (let i = 0; i < 12; i++)
        neckPoints.push(
          P(local(s, [r * Math.cos((i * Math.PI) / 6), y, r * 1.1 * Math.sin((i * Math.PI) / 6)])),
        );
    layer(sp.neck, '<g class="bw-human-neck">' + path(softHull(neckPoints)) + "</g>");
    const headAngle = (sp.config.variant === "hip_thrust" ? 0 : s.torsoAngle || 0) * rad;
    const hp = (x, y, z = 0) =>
      add(sp.head, [
        x * Math.cos(headAngle) - y * Math.sin(headAngle),
        x * Math.sin(headAngle) + y * Math.cos(headAngle),
        z,
      ]);
    // The shared head, scaled to this rig and turned with the head. When the
    // camera sees the face (or the back of the head) more than the profile,
    // use the front-view head on the head's lateral plane; otherwise the
    // side profile, so the nose always points the way the body faces.
    const centre = P(hp(0, 0)),
      forwardSpan = length(sub(P(hp(10, 0)), centre)),
      lateralSpan = length(sub(P(hp(0, 0, 10)), centre));
    let head;
    if (lateralSpan > forwardSpan) {
      const facePoint = ([x, y]) => P(hp(0, (y + 93) * 0.88, x * 0.88));
      head =
        path(G.smoothClosed(G.HEAD_FRONT.map(facePoint))) +
        (rear
          ? G.hair(G.HAIR_BACK, facePoint)
          : G.hair(G.HAIR_FRONT, facePoint) + G.details(G.FACE_FRONT, false, facePoint));
    } else {
      const headPoint = ([x, y]) => P(hp(x * 0.88, (y + 93) * 0.88));
      head =
        path(G.smoothClosed(G.HEAD_SIDE.map(headPoint))) +
        G.hair(G.HAIR_SIDE, headPoint) +
        G.details(rear ? G.FACE_SIDE.slice(0, 1) : G.FACE_SIDE, false, headPoint);
    }
    layer(sp.head, '<g class="bw-human-head bw-athlete-portrait">' + head + "</g>");
    for (const g of sp.gear) {
      if (g.kind === "barbell") {
        line(add(g.at, [0, 0, -g.half]), add(g.at, [0, 0, g.half]), 2.3, "#527087");
        for (const sign of [-1, 1]) {
          plate(add(g.at, [0, 0, sign * g.plateZ]), g.axis, g.radius);
          line(add(g.at, [0, 0, sign * 94]), add(g.at, [0, 0, sign * 99]), 4, "#9aabb8");
        }
      } else if (g.kind === "trapbar") {
        const ps = [
          [-27, 0, -20],
          [-27, 0, 20],
          [-13, 0, 40],
          [28, 0, 40],
          [40, 0, 20],
          [40, 0, -20],
          [28, 0, -40],
          [-13, 0, -40],
        ];
        for (let i = 0; i < ps.length; i++)
          line(add(g.at, ps[i]), add(g.at, ps[(i + 1) % ps.length]), 2.3);
        for (const sign of [-1, 1]) {
          line(add(g.at, [-10, 0, sign * 30]), add(g.at, [12, 0, sign * 30]), 3);
          line(add(g.at, [5, 0, sign * 40]), add(g.at, [5, 0, sign * 88]), 2.5);
          plate(add(g.at, [5, 0, sign * 70]), g.axis, 27);
        }
      } else if (g.kind === "dumbbell") {
        line(add(g.at, mul(g.axis, -14)), add(g.at, mul(g.axis, 14)), 2.1);
        for (const sign of [-1, 1]) plate(add(g.at, mul(g.axis, sign * 11)), g.axis, 8, 6);
      } else if (g.kind === "kettlebell") {
        const center = add(g.at, [0, 11, 0]);
        layer(center, path(ellipse(center, [9, 0, 0], [0, 9, 0], c)));
        const a = add(g.at, [0, 1, -6]),
          b = add(g.at, [0, 1, 6]),
          top = add(g.at, [0, -7, 0]);
        layer(g.at, path(`M${xy(P(a))}Q${xy(P(top))} ${xy(P(b))}`, "none", 'stroke-width="1.8"'));
      } else if (g.kind === "bench" || g.kind === "box") {
        cuboid(g.min, g.max);
        if (g.kind === "bench")
          for (const x of [g.min[0] + 8, g.max[0] - 8])
            for (const z of [g.min[2] + 6, g.max[2] - 6]) line([x, g.max[1], z], [x, F, z], 2);
      } else if (g.kind === "pad") {
        line(add(g.at, [0, 0, -24]), add(g.at, [0, 0, 24]), 7, "#d5dfe7");
      } else if (g.kind === "handle")
        line(add(g.at, [0, 0, -g.half]), add(g.at, [0, 0, g.half]), 3);
      else if (g.kind === "pulldown") {
        const points = [
          add(g.at, [5, 5, -55]),
          add(g.at, [0, 0, -35]),
          add(g.at, [0, 0, 35]),
          add(g.at, [5, 5, 55]),
        ];
        for (let i = 0; i < 3; i++) line(points[i], points[i + 1], 2.5);
      } else
        line(
          g.a,
          g.b,
          g.kind === "post" ? 2 : g.kind === "band" ? 1.3 : 1,
          g.kind === "band" ? "#9a8668" : "#849aaa",
        );
    }
    return (
      '<g class="bw-human-athlete bw-human-outline bw-human-natural bw-human-sketch bw-human-spatial" fill="#fff" stroke="#344b5e" stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round">' +
      layers
        .sort((a, b) => a.z - b.z)
        .map((l) => (l.svg.includes('class="bw-human-') ? H.seamless(l.svg) : l.svg))
        .join("") +
      "</g>"
    );
  }
  function finish(s) {
    s.extras = "";
    s.frontExtras = "";
    s.framingPoints = [];
    s.groundLine = "M0,0";
    // A small local reference line, never included in the body's camera bounds.
    const c = s.spatial.camera,
      a = project([65, F, -65], c),
      b = project([290, F, 65], c);
    s.extras = path(`M${xy(a)}L${xy(b)}`, "none", 'stroke="#d4dfe7" stroke-width=".65"');
    s.viewLabel = c.view === "rear-quarter" ? "Widok 3/4 od tyłu" : "Widok 3/4 od przodu";
    return s;
  }
  function install(models, records) {
    for (const record of records) {
      const c = record.motion,
        model = models[record.id];
      if (!c || !model || !policy(c) || model.spatialVersion === 53) continue;
      const base = model.sample;
      model.spatialVersion = 53;
      model.sample = (p) => {
        const s = base(p);
        body(s, c);
        equipment(s, c);
        return finish(s);
      };
    }
  }
  H.baseDraw = H.draw;
  H.baseArmPoints = H.armPoints;
  H.basePoints = H.points;
  H.armPoints = (s, side, ...args) =>
    s.spatial
      ? Object.fromEntries(
          ["shoulder", "elbow", "wrist"].map((k) => [
            k,
            project(s.spatial.joints[side][k], s.spatial.camera),
          ]),
        )
      : H.baseArmPoints(s, side, ...args);
  H.points = (s) => (s.spatial ? worldBounds(s) : H.basePoints(s));
  H.draw = scope.drawBallwiseAthlete = draw;
  scope.BWSpatial = {
    install,
    project,
    depth,
    local,
    ik,
    policy,
    version: 53,
    addBox(s) {
      s.spatial.gear.push({ kind: "box", min: [85, 203, -28], max: [141, F, 28] });
      return finish(s);
    },
  };
})(typeof window === "object" ? window : globalThis);
