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
  function muscleLines(a, b, c, kind, far, scene, side = "right") {
    const groups = muscles(scene),
      u = unit(a, b),
      n = normal(u),
      v = unit(b, c),
      m = normal(v);
    const thin = `stroke="#718392" stroke-width=".6" opacity="${far ? 0.27 : 0.43}"`;
    let svg = "";
    const trace = (name, points) => {
      if (!groups.includes(name)) return;
      svg +=
        `<g data-muscle="${name}">` +
        detail(`M${xy(points[0])}Q${xy(points[1])} ${xy(points[2])}`, thin) +
        "</g>";
    };
    const along = (x, y, t, offset, normalVector) => add(mix(x, y, t), scale(normalVector, offset));
    if (kind === "leg") {
      trace("quadriceps", [
        along(a, b, 0.22, 3, n),
        along(a, b, 0.49, 8, n),
        along(a, b, 0.82, 2, n),
      ]);
      trace("hamstrings", [
        along(a, b, 0.21, -4, n),
        along(a, b, 0.5, -7, n),
        along(a, b, 0.8, -2, n),
      ]);
      trace("adductors", [
        along(a, b, 0.19, -2, n),
        along(a, b, 0.42, -5, n),
        along(a, b, 0.7, -1, n),
      ]);
      trace("glutes", [
        along(a, b, 0.02, -6, n),
        along(a, b, 0.13, -12, n),
        along(a, b, 0.27, -6, n),
      ]);
      for (const group of ["calves", "soleus"])
        trace(group, [
          along(b, c, group === "soleus" ? 0.32 : 0.15, 4, m),
          along(b, c, 0.45, 8, m),
          along(b, c, 0.76, 1, m),
        ]);
      trace("tibialis", [
        along(b, c, 0.23, -2, m),
        along(b, c, 0.54, -4, m),
        along(b, c, 0.88, -1, m),
      ]);
    } else {
      trace("biceps", [along(a, b, 0.29, 2, n), along(a, b, 0.55, 5, n), along(a, b, 0.83, 1, n)]);
      trace("triceps", [
        along(a, b, 0.27, -2, n),
        along(a, b, 0.53, -5, n),
        along(a, b, 0.82, -1, n),
      ]);
      for (const group of ["delts", "rear_delts"])
        trace(group, [along(a, b, 0.03, 1, n), along(a, b, 0.13, 7, n), along(a, b, 0.32, 2, n)]);
      trace("forearms", [along(b, c, 0.17, 1, m), along(b, c, 0.43, 4, m), along(b, c, 0.8, 1, m)]);
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
  function torsoMuscles(scene, transform, rear = false) {
    const groups = muscles(scene),
      d = (name, points) =>
        groups.includes(name)
          ? `<g data-muscle="${name}">` +
            detail(
              `M${xy(transform(points[0]))}Q${xy(transform(points[1]))} ${xy(transform(points[2]))}`,
              'stroke="#718392" stroke-width=".6" opacity=".36"',
            ) +
            "</g>"
          : "";
    let svg = "";
    if (rear) {
      svg +=
        d("upper_back", [
          [-12, -54],
          [-6, -46],
          [-2, -42],
        ]) +
        d("upper_back", [
          [12, -54],
          [6, -46],
          [2, -42],
        ]);
      svg +=
        d("lats", [
          [-14, -48],
          [-12, -34],
          [-6, -25],
        ]) +
        d("lats", [
          [14, -48],
          [12, -34],
          [6, -25],
        ]);
      svg +=
        d("erectors", [
          [-4, -43],
          [-5, -31],
          [-4, -19],
        ]) +
        d("erectors", [
          [4, -43],
          [5, -31],
          [4, -19],
        ]);
    } else {
      svg +=
        d("pecs", [
          [-13, -51],
          [-8, -44],
          [-1, -47],
        ]) +
        d("pecs", [
          [13, -51],
          [8, -44],
          [1, -47],
        ]);
      svg +=
        d("abdominals", [
          [-4, -40],
          [-5, -30],
          [-3, -20],
        ]) +
        d("abdominals", [
          [4, -40],
          [5, -30],
          [3, -20],
        ]);
      svg +=
        d("lats", [
          [-14, -48],
          [-12, -34],
          [-8, -27],
        ]) +
        d("lats", [
          [14, -48],
          [12, -34],
          [8, -27],
        ]);
    }
    svg +=
      d("obliques", [
        [-14, -36],
        [-12, -28],
        [-8, -21],
      ]) +
      d("obliques", [
        [14, -36],
        [12, -28],
        [8, -21],
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
      : [Math.sin(a) * 30, Math.cos(a) * 30];
    const wrist = front
      ? [(far ? -1 : 1) * (5 + 2 * Math.abs(swing)), 46 - 14 * swing]
      : [elbow[0] + Math.cos(a) * 23, elbow[1] - Math.sin(a) * 23];
    return {
      shoulder,
      elbow: add(shoulder, rotate(elbow, angle)),
      wrist: add(shoulder, rotate(wrist, angle)),
    };
  }
  function shoe(l, front) {
    const phase = Math.max(0, Math.min(1, ((l.local ?? 0) - 0.34) / 0.66));
    const angle = Number.isFinite(l.footAngle)
      ? l.footAngle
      : l.contact
        ? 0
        : -16 * Math.sin(Math.PI * phase);
    return (
      `<g class="bw-human-shoe" transform="translate(${xy(l.ankle)}) rotate(${fmt(angle)})" fill="${colours.shoe}">` +
      path("M-4,-11Q0,-9 4,-11L4,-3Q0,-1 -4,-3Z", 'fill="#fff" stroke-width=".65"') +
      detail("M-3.5,-8Q0,-7 3.5,-8", 'stroke-width=".5"') +
      path("M-5,-5 Q-1,-7 4,-4 L7,1 Q10,4 15,5 Q17,7 16,10 L-7,10 L-7,1 Q-7,-3 -5,-5Z") +
      path("M-7,8 Q5,9 16,8 L16,11 L-7,11Z", 'fill="#fff" stroke-width=".6"') +
      detail("M-1,-1L5,0 M0,2L7,3 M-4,5Q-1,3 2,5", 'stroke-width=".65" opacity=".55"') +
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
      shorts(hip, l.knee, far) +
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
      sleeve(shoulder, elbow) +
      muscleLines(shoulder, elbow, wrist, "arm", far, scene, side) +
      `<g class="bw-human-hand" transform="translate(${xy(hand)}) rotate(${fmt(degrees)})">` +
      path("M-3,-2.2 Q-2,-4 0,-3.6 L3,-3.3 Q6,-2.5 5.2,-.2 Q6,2 3.8,2.8 L-.5,3 Q-3,3 -3,-.2Z") +
      detail("M.5,-1.9L3.5,-1.4 M.6,0L3.7,.4", 'stroke-width=".5" opacity=".5"') +
      "</g></g>"
    );
  }
  function face(front) {
    const neck = path("M-5,-79L-5,-65Q0,-62 5,-66L5,-80Z", 'fill="#fff"');
    return (
      neck +
      (front
        ? path(
            "M-10,-93C-11,-103 -6,-108 0,-108C8,-108 12,-102 11,-93L10,-83Q7,-75 0,-74Q-7,-75 -10,-83Z",
            'fill="#fff"',
          ) +
          detail(
            "M-6,-91h2M4,-91h2M0,-89l-1,4 2,0M-2,-81q2,1 4,0M-9,-97q8,-7 16,-1 M-8,-101q6,-10 15,-3 M-4,-102q6,-7 13,1",
            'stroke-width=".5" opacity=".55"',
          )
        : path(
            "M-10,-93C-12,-103 -6,-109 1,-108C9,-108 13,-101 12,-94L11.7,-90L15,-85.6Q15.6,-84 12,-83.8L11.8,-79Q9,-73 3,-75C-3,-76 -7,-81 -8,-86Z",
            'fill="#fff"',
          ) +
          path(
            "M-10,-96Q-14,-103 -8,-108Q-6,-113 2,-110Q10,-112 13,-104L12,-97Q6,-101 2,-99Q-1,-94 -3,-90L-6,-93Z",
            'fill="#fff"',
          ) +
          detail(
            "M-7,-89q4,-4 5,2l-2,3M8,-92l2,.3M9,-80h2M-9,-98q8,-7 16,-1 M-9,-101q4,-10 13,-8 M-5,-103q5,-6 12,-3 M-2,-104q5,-5 11,0",
            'stroke-width=".5" opacity=".55"',
          ))
    );
  }
  function torso(scene, angle, front) {
    const expansion = 1 + Math.max(0, scene.breath ?? 0) * 0.015;
    const shirt = front
      ? "M-7,-65 Q-19,-68 -25,-58 L-21,-43 Q-16,-35 -16,-13 Q0,-8 16,-13 Q16,-35 21,-43 L25,-58 Q19,-68 7,-65 Q0,-58 -7,-65Z"
      : `M-7,-65 Q2,-70 12,-60 Q21,-51 18,-40 Q14,-28 17,-13 Q1,-8 -19,-13 Q${-21 - (scene.spineCurve ?? 0)},-33 ${-20 - (scene.spineCurve ?? 0)},-46 Q-23,-58 -7,-65Z`;
    return (
      `<g class="bw-human-torso" transform="translate(${xy(scene.hip)}) rotate(${fmt(angle)})"><g transform="translate(0 -67) rotate(${fmt(scene.headAngle ?? 0)}) scale(1) translate(0 67)">${face(front)}</g><g transform="scale(${fmt(expansion)} 1)">` +
      path(shirt, `fill="${colours.shirt}"`) +
      detail(
        front
          ? "M-7,-64Q0,-59 7,-64 M-11,-18Q0,-16 11,-18"
          : "M-5,-64Q1,-58 6,-63 M-12,-18Q0,-15 10,-18",
        'stroke="#71899b" opacity=".32" stroke-width=".45"',
      ) +
      torsoMuscles(scene, (p) => p, !front && Math.sin((angle * Math.PI) / 180) < -0.6) +
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
    const waist = `<g transform="translate(${xy(scene.hip)}) rotate(${fmt(angle)})" fill="#fff" stroke="none">${path("M-14,-13Q0,-9 13,-13L13,5Q3,14 -7,9Q-13,5 -14,-13Z")}${detail("M-14,-13Q-16,-1 -10,8M13,-13Q17,-1 11,8", 'stroke="' + colours.ink + '" stroke-width=".85"')}</g>`;
    const layers = front
      ? farLeg + nearLeg + torso(scene, angle, true) + waist + farArm + nearArm
      : farArm + farLeg + torso(scene, angle, false) + nearLeg + waist + nearArm;
    return `<g class="bw-human-athlete bw-human-outline bw-human-natural bw-human-sketch bw-human-${front ? "front" : "side"}" stroke="${colours.ink}" stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round"${mirror}>${layers}</g>`;
  }
  scope.drawBallwiseAthlete = draw;
  scope.BWDrawHuman = {
    draw,
    armPoints,
    points,
    geometry: { limb, muscleLines, shorts, sleeve, torsoMuscles },
    muscles,
    style: "athletic-sketch-54",
    version: 54,
  };
})(typeof window === "object" ? window : globalThis);
