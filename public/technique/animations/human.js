/* Shared human figure for every instructional motion. Pose inputs remain untouched. */
(function (scope) {
  "use strict";
  const fmt = (n) => Number(n).toFixed(3);
  const xy = (p) => p.map(fmt).join(",");
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
  const path = (d, extra = "") => `<path d="${d}" ${extra}/>`;
  const detail = (d, extra = "") =>
    path(d, `fill="none" ${extra.includes("stroke-width=") ? "" : 'stroke-width=".72"'} ${extra}`);

  /** A single anatomical envelope. Both sides have a shared tangent at every
   * cubic join, including a straight knee/elbow; no doubled joint endpoints or
   * offset-line miters. The supplied a/b/c remain the underlying joint centres. */
  function limb(a, b, c, width) {
    const u = unit(a, b),
      v = unit(b, c),
      n = normal(u),
      m = normal(v);
    const lenA = Math.hypot(b[0] - a[0], b[1] - a[1]),
      lenB = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const sum = add(u, v),
      sumLength = Math.hypot(...sum);
    const turn = u[0] * v[1] - u[1] * v[0];
    const tangent = sumLength > 0.0001 ? scale(sum, 1 / sumLength) : scale(n, turn < 0 ? -1 : 1);
    const jointNormal = normal(tangent),
      jointHandle = Math.min(lenA, lenB) * 0.115;
    const cap = width.end * 0.85;
    const outlineSide = (sign) => {
      const start = add(a, scale(n, width.root * sign));
      const upper = add(mix(a, b, 0.4), scale(n, width.upper * sign));
      const joint = add(b, scale(jointNormal, width.joint * sign));
      const lower = add(mix(b, c, 0.39), scale(m, width.lower * sign));
      const end = add(c, scale(m, width.end * sign));
      return { start, upper, joint, lower, end };
    };
    const l = outlineSide(1),
      r = outlineSide(-1);
    const cubic = (c1, c2, end) => `C${xy(c1)} ${xy(c2)} ${xy(end)}`;
    const forward = (s) =>
      cubic(add(s.start, scale(u, lenA * 0.14)), add(s.upper, scale(u, -lenA * 0.14)), s.upper) +
      cubic(
        add(s.upper, scale(u, lenA * 0.21)),
        add(s.joint, scale(tangent, -jointHandle)),
        s.joint,
      ) +
      cubic(
        add(s.joint, scale(tangent, jointHandle)),
        add(s.lower, scale(v, -lenB * 0.14)),
        s.lower,
      ) +
      cubic(add(s.lower, scale(v, lenB * 0.22)), add(s.end, scale(v, -lenB * 0.18)), s.end);
    const reverse = (s) =>
      cubic(add(s.end, scale(v, -lenB * 0.18)), add(s.lower, scale(v, lenB * 0.22)), s.lower) +
      cubic(
        add(s.lower, scale(v, -lenB * 0.14)),
        add(s.joint, scale(tangent, jointHandle)),
        s.joint,
      ) +
      cubic(
        add(s.joint, scale(tangent, -jointHandle)),
        add(s.upper, scale(u, lenA * 0.21)),
        s.upper,
      ) +
      cubic(add(s.upper, scale(u, -lenA * 0.14)), add(s.start, scale(u, lenA * 0.14)), s.start);
    return path(
      `M${xy(l.start)}${forward(l)}${cubic(add(l.end, scale(v, cap)), add(r.end, scale(v, cap)), r.end)}${reverse(r)}${cubic(add(r.start, scale(u, -width.root * 0.7)), add(l.start, scale(u, -width.root * 0.7)), l.start)}Z`,
    );
  }

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
  /** Bare anatomical foot: heel, arch and toes in one contour. */
  function shoe(l) {
    const phase = Math.max(0, Math.min(1, ((l.local ?? 0) - 0.34) / 0.66));
    const angle = Number.isFinite(l.footAngle)
      ? l.footAngle
      : l.contact
        ? 0
        : -16 * Math.sin(Math.PI * phase);
    return (
      `<g class="bw-human-shoe bw-human-foot" transform="translate(${xy(l.ankle)}) rotate(${fmt(angle)})" fill="${colours.shoe}">` +
      path(
        "M-3.4,-6 Q-6.6,1 -5.8,7.4 Q-5,10.2 -1.5,10.2 L13.4,10.2 Q16.8,10 16.4,7.6 Q15.6,5.4 11,4.6 Q6,3.4 3.6,-1.6 L3.2,-6 Z",
      ) +
      "</g>"
    );
  }
  function leg(scene, side, front) {
    const l = scene[side],
      hip = l.hip ?? scene.hip,
      far = side === "left";
    return (
      `<g class="bw-human-leg bw-human-leg-${side}" fill="${far ? colours.farSkin : colours.skin}" stroke="${far ? "#7c8e9d" : colours.ink}">` +
      limb(hip, l.knee, l.ankle, { root: 10.5, upper: 14.2, joint: 5.8, lower: 9.4, end: 3.7 }) +
      muscleLines(hip, l.knee, l.ankle, "leg", far, scene, side) +
      shoe(l, front) +
      "</g>"
    );
  }
  function arm(scene, side, angle, front) {
    const { shoulder, elbow, wrist } = armPoints(scene, side, angle, front),
      far = side === "left";
    const axis = unit(elbow, wrist),
      hand = add(wrist, scale(axis, 3.5)),
      degrees = (Math.atan2(axis[1], axis[0]) * 180) / Math.PI;
    return (
      `<g class="bw-human-arm bw-human-arm-${side}" fill="${far ? colours.farSkin : colours.skin}" stroke="${far ? "#7c8e9d" : colours.ink}">` +
      limb(shoulder, elbow, wrist, { root: 7.2, upper: 8.8, joint: 4.0, lower: 5.8, end: 2.7 }) +
      muscleLines(shoulder, elbow, wrist, "arm", far, scene, side) +
      `<g class="bw-human-hand" transform="translate(${xy(hand)}) rotate(${fmt(degrees)})">` +
      path("M-3,-2.2 Q-2,-4 0,-3.6 L3,-3.3 Q6,-2.5 5.2,-.2 Q6,2 3.8,2.8 L-.5,3 Q-3,3 -3,-.2Z") +
      "</g></g>"
    );
  }
  /** Smooth faceless head and neck: a calm silhouette, no hair or features. */
  function face(front) {
    const neck = path("M-5,-80L-5.4,-64Q0,-61.5 5.4,-64L5,-80Z", 'fill="#fff"');
    return (
      neck +
      (front
        ? path(
            "M0,-108C7.5,-108 11,-102.5 10.6,-94.5C10.3,-87 7,-77 0,-75.5C-7,-77 -10.3,-87 -10.6,-94.5C-11,-102.5 -7.5,-108 0,-108Z",
            'fill="#fff"',
          )
        : path(
            "M1,-108.5C9,-108.5 12.6,-102 12.2,-95L13.6,-90.6Q14.6,-88.2 12.2,-87.6L11.6,-82Q10,-75.4 2.6,-75.2C-4.6,-75.6 -9,-81.4 -10,-89C-11,-100 -6,-108.5 1,-108.5Z",
            'fill="#fff"',
          ))
    );
  }
  /** One continuous trunk outline: shoulders, ribcage, waist and pelvis. */
  function trunkPath(front, spineCurve = 0) {
    if (front)
      return "M-6,-66.5Q-18,-67 -23.5,-60Q-25.5,-52 -21,-43Q-16.5,-33 -15.6,-22Q-15.4,-13 -17,-5Q-16,4 -8,7.5Q0,9 8,7.5Q16,4 17,-5Q15.4,-13 15.6,-22Q16.5,-33 21,-43Q25.5,-52 23.5,-60Q18,-67 6,-66.5Q0,-63 -6,-66.5Z";
    const k = spineCurve;
    return `M-5.6,-66.4Q-14.6,-65.4 -17.4,-56.6Q-19.6,-47 ${fmt(-15.8 - k)},-37Q${fmt(-12.4 - k)},-27 -14.6,-16.5Q-18.4,-6 -12.4,3.4Q-4,9 6,6Q12.6,3.6 13,-5Q13.2,-14 11.2,-22Q10.2,-30 13.6,-39Q17.6,-48 15.2,-57Q11.8,-65.4 5.6,-66.4Q0,-63.2 -5.6,-66.4Z`;
  }
  function torso(scene, angle, front) {
    const expansion = 1 + Math.max(0, scene.breath ?? 0) * 0.015;
    return (
      `<g class="bw-human-torso" transform="translate(${xy(scene.hip)}) rotate(${fmt(angle)})"><g transform="translate(0 -67) rotate(${fmt(scene.headAngle ?? 0)}) scale(1) translate(0 67)">${face(front)}</g><g transform="scale(${fmt(expansion)} 1)">` +
      path(trunkPath(front, scene.spineCurve ?? 0), `fill="${colours.shirt}"`) +
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
    const ink = svg.replace(/class="bw-muscle-traces/g, 'display="none" class="bw-muscle-traces');
    const fill = svg.replace(/stroke="(#7c8e9d|#344b5e)"/g, 'stroke="none"');
    return `<g class="bw-silhouette-ink" stroke-width="2.3">${ink}</g><g class="bw-silhouette-fill" stroke="none">${fill}</g>`;
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
    armPoints,
    points,
    geometry: { limb, muscleLines, shorts, sleeve, torsoMuscles, belly, trunkPath },
    muscles,
    style: "anatomical-outline-55",
    version: 55,
  };
})(typeof window === "object" ? window : globalThis);
