/* Canonical exercise demonstrations. Geometry describes an example, never a measured athlete. */
(function (scope) {
  "use strict";
  const A = scope.BWAnim,
    M = A.math,
    F = 264,
    fmt = (n) => Number(n).toFixed(3);
  const v = (a, b, t) => [M.mix(a[0], b[0], t), M.mix(a[1], b[1], t)];
  const rot = (p, degrees) => {
    const a = (degrees * Math.PI) / 180;
    return [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
  };
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const smooth = M.smooth,
    clamp = M.clamp,
    mod = M.mod;
  function leg(hip, ankle, contact = false, footAngle = 0, surface = "floor", bend = 1) {
    return {
      knee: M.ik(hip, ankle, bend),
      ankle: [...ankle],
      contact,
      footAngle,
      contactSurface: surface,
    };
  }
  function foot(x, y = F, angle = 0) {
    return [x, y - M.sole(angle).lowest];
  }
  function pose(p, hip = [160, 142], a = foot(170), b = foot(150), angle = 0, view = "side") {
    return {
      p,
      hip: [...hip],
      right: leg(hip, a, true),
      left: leg(hip, b, true),
      torsoAngle: angle,
      view,
      armDrive: 0,
      groundSpeed: 0,
      phase: "Ustaw pozycję",
      props: { back: "", front: "", points: [] },
      supports: { floor: { type: "line", y: F } },
    };
  }
  function point(s, x, y) {
    return add(s.hip, rot([x, y], s.torsoAngle ?? 0));
  }
  function rep(p) {
    return p < 0.44 ? smooth(p / 0.44) : p < 0.56 ? 1 : 1 - smooth((p - 0.56) / 0.44);
  }
  function hold(p) {
    return p < 0.18 ? smooth(p / 0.18) : p < 0.85 ? 1 : 1 - smooth((p - 0.85) / 0.15);
  }
  function phase(
    s,
    p,
    labels = [
      "Zejdź spokojnie · zachowaj ustawienie",
      "Zatrzymaj ruch pod kontrolą",
      "Wróć do pozycji wyjściowej",
    ],
  ) {
    s.phase = p < 0.44 ? labels[0] : p < 0.56 ? labels[1] : labels[2];
    return s;
  }
  function xmlPath(d, fill = "none", stroke = "#7f94a5", width = 1.2) {
    return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  function rect(x, y, w, h, fill = "#e4ebf1", r = 2) {
    return `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" rx="${r}" fill="${fill === "none" ? "none" : "#fbfcfd"}" stroke="#8399aa" stroke-width="1"/>`;
  }
  function circle(x, y, r, fill = "#e1e8ee") {
    return `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${r}" fill="${fill === "none" ? "none" : "#fbfcfd"}" stroke="#7890a3" stroke-width="1"/>`;
  }
  function prop(s, svg, bounds, front = false) {
    s.props[front ? "front" : "back"] += svg;
    s.props.points.push(...bounds);
  }
  function line(s, a, b, colour = "#8ba1b2", width = 2, front = false) {
    prop(s, xmlPath(`M${a}L${b}`, "none", colour, width), [a, b], front);
  }
  function bench(s, x = 91, y = 221, width = 137) {
    s.supports.bench = { type: "line", y };
    prop(
      s,
      rect(x, y, width, 8, "#d7e1e9") +
        xmlPath(`M${x + 12},${y + 8}V264M${x + width - 12},${y + 8}V264`, "none", "#8ba1b2", 3),
      [
        [x, y],
        [x + width, F],
      ],
    );
  }
  function dumbbell(s, at, vertical = false) {
    const x = at[0],
      y = at[1];
    prop(
      s,
      `<g transform="translate(${fmt(x)} ${fmt(y)})${vertical ? " rotate(90)" : ""}">${rect(-13, -5, 7, 10, "#557086")}${rect(6, -5, 7, 10, "#557086")}${xmlPath("M-6,0H6", "none", "#4a6378", 3)}</g>`,
      [
        [x - 15, y - 15],
        [x + 15, y + 15],
      ],
      true,
    );
  }
  function kettlebell(s, at) {
    const [x, y] = at;
    prop(
      s,
      xmlPath(
        `M${x - 6},${y + 2}Q${x - 7},${y - 7} ${x},${y - 7}Q${x + 7},${y - 7} ${x + 6},${y + 2}`,
        "none",
        "#557086",
        2,
      ) + circle(x, y + 9, 9, "#557086"),
      [
        [x - 11, y - 8],
        [x + 11, y + 19],
      ],
      true,
    );
  }
  function barbell(s, at, front = s.view === "front", trap = false) {
    const [x, y] = at,
      w = front ? 61 : 29;
    let svg = xmlPath(`M${x - w - 6},${y}H${x + w + 6}`, "none", "#617c91", 3);
    for (const sign of [-1, 1]) {
      svg +=
        rect(x + sign * w - 5, y - 27, 10, 54, "#405b72", 3) +
        rect(x + sign * (w + 7) - 2, y - 19, 4, 38, "#8ba1b2", 1);
    }
    if (trap)
      svg += xmlPath(
        `M${x - 26},${y - 8}L${x - 17},${y - 16}H${x + 17}L${x + 26},${y - 8}V${y + 8}L${x + 17},${y + 16}H${x - 17}L${x - 26},${y + 8}Z`,
        "none",
        "#7a90a2",
        2,
      );
    prop(
      s,
      svg,
      [
        [x - w - 10, y - 29],
        [x + w + 10, y + 29],
      ],
      true,
    );
  }
  function hands(s, right, left = right, bend = -1) {
    s.handTargets = { right, left };
    s.elbowBend = { right: bend, left: s.view === "front" ? -bend : bend };
    return {
      right: scope.BWDrawHuman.armPoints(s, "right", s.torsoAngle ?? 0, s.view === "front").wrist,
      left: scope.BWDrawHuman.armPoints(s, "left", s.torsoAngle ?? 0, s.view === "front").wrist,
    };
  }
  function rackArms(s, front = false) {
    s.arms = {};
    for (const side of ["right", "left"]) {
      const far = side === "left",
        shoulder = point(s, far ? -4 : 2, -61);
      s.arms[side] = {
        shoulder,
        elbow: point(s, front ? (far ? 24 : 28) : -18, front ? -47 : -35),
        wrist: point(s, front ? (far ? 16 : 20) : far ? -23 : -20, front ? -65 : -58),
      };
    }
  }
  function hangingArms(s) {
    return hands(s, [s.hip[0] + 10, s.hip[1] - 4], [s.hip[0] - 3, s.hip[1] - 1]);
  }
  function load(s, c, placement = "hands") {
    const gear = c.equipment;
    if (!gear) return;
    const arms = {
      right: scope.BWDrawHuman.armPoints(s, "right", s.torsoAngle ?? 0, s.view === "front"),
      left: scope.BWDrawHuman.armPoints(s, "left", s.torsoAngle ?? 0, s.view === "front"),
    };
    const centre = v(arms.right.wrist, arms.left.wrist, 0.5);
    if (gear === "kettlebell") kettlebell(s, centre);
    else if (gear === "barbell_back" || gear === "barbell_band" || gear === "pins") {
      barbell(s, point(s, -1, -58));
      if (gear === "barbell_band") {
        const at = point(s, -1, -58);
        for (const sign of [-1, 1])
          line(s, [sign < 0 ? 131 : 188, F], [at[0] + 29 * sign, at[1]], "#bd925f", 1.5);
      }
      if (gear === "pins") {
        prop(
          s,
          xmlPath(
            `M105,264V48M214,264V48M105,${point(s, -1, -58)[1] - 2.5}H214`,
            "none",
            "#90a4b4",
            3,
          ),
          [
            [103, 46],
            [216, F],
          ],
        );
      }
    } else if (gear === "barbell_front") barbell(s, point(s, 20, -65));
    else if (gear === "barbell" || gear === "trapbar")
      barbell(s, centre, false, gear === "trapbar");
    else if (gear.includes("dumbbell") || gear.includes("kettlebell")) {
      if (gear === "front_kettlebells") {
        kettlebell(s, arms.left.wrist);
        kettlebell(s, arms.right.wrist);
      } else if (gear.includes("one_") || gear === "dumbbell" || gear === "bench_dumbbell")
        dumbbell(s, arms.right.wrist);
      else {
        dumbbell(s, arms.left.wrist);
        dumbbell(s, arms.right.wrist);
      }
    }
    if (gear === "flywheel") {
      line(s, s.hip, [181, 248], "#9c835f", 2);
      prop(s, rect(165, 242, 38, 20, "#ccd9e3") + circle(185, 252, 10, "#5c788e"), [
        [162, 240],
        [205, F],
      ]);
    }
  }
  function squat(c, p) {
    const r = c.isometric ? 0.72 : c.equipment === "flywheel" ? 1 - rep(p) : rep(p),
      hip = [160 - 28 * r, 142 + 53 * r],
      s = pose(p, hip, foot(170), foot(148), r * 24);
    if (c.equipment?.startsWith("barbell") || c.equipment === "pins")
      rackArms(s, c.equipment === "barbell_front");
    else if (c.equipment === "kettlebell") hands(s, point(s, 18, -45), point(s, 13, -44));
    else hands(s, point(s, 29, -48), point(s, 24, -46));
    load(s, c);
    return phase(
      s,
      p,
      c.isometric
        ? [
            "Zbuduj napięcie przeciw nieruchomemu oporowi",
            "Utrzymuj pozycję · oddychaj",
            "Rozluźnij napięcie bez zmiany ustawienia",
          ]
        : c.equipment === "flywheel"
          ? [
              "Wstań płynnie i rozpędź koło",
              "Zachowaj napięcie linki · bez szarpania",
              "Zahamuj powrót pod kontrolą · ustawienie urządzenia dobiera trener",
            ]
          : undefined,
    );
  }
  function split(c, p) {
    const reverse = c.variant === "reverse_lunge",
      r = reverse
        ? p < 0.2
          ? 0
          : p < 0.5
            ? smooth((p - 0.2) / 0.3)
            : p < 0.8
              ? 1 - smooth((p - 0.5) / 0.3)
              : 0
        : rep(p),
      rearElevated = c.variant === "bulgarian_split_squat",
      hip = [163, 154 + 40 * r],
      s = pose(p, hip, foot(205), rearElevated ? foot(95, 222, -35) : foot(110), r * 13);
    if (rearElevated) {
      s.left.contactSurface = "bench";
      bench(s, 61, 222, 51);
    }
    if (c.variant === "reverse_lunge") {
      const step = p < 0.2 ? smooth(p / 0.2) : p < 0.8 ? 1 : 1 - smooth((p - 0.8) / 0.2),
        lift =
          p < 0.2
            ? 15 * Math.sin((p / 0.2) * Math.PI)
            : p > 0.8
              ? 15 * Math.sin(((p - 0.8) / 0.2) * Math.PI)
              : 0;
      s.left = leg(hip, foot(150 - 40 * step, F - lift), lift < 0.001, 0);
    }
    hangingArms(s);
    load(s, c);
    if (reverse) {
      s.phase =
        p < 0.2
          ? "Cofnij nogę i oprzyj przodostopie"
          : p < 0.5
            ? "Ugnij obie nogi · ciężar na przedniej stopie"
            : p < 0.8
              ? "Wstań z przedniej nogi bez przechylania tułowia"
              : "Dostaw tylną nogę pod kontrolą";
      return s;
    }
    return phase(s, p, [
      "Ugnij obie nogi · ciężar na przedniej stopie",
      "Kolano prowadź w kierunku palców",
      "Wstań z przedniej nogi · zachowaj równowagę",
    ]);
  }
  function lateralLunge(c, p) {
    const r = rep(p),
      s = pose(p, [160 + 30 * r, 171 + 27 * r], foot(235), foot(107), r * 8, "front");
    s.right.knee = [M.mix(s.hip[0], 235, 0.504) + 6 * r, M.mix(s.hip[1], s.right.ankle[1], 0.504)];
    s.left.knee = v(s.hip, s.left.ankle, 0.504);
    hands(s, point(s, 6, -43), point(s, -4, -43));
    return phase(s, p, [
      "Cofnij biodro nad uginaną nogą",
      "Druga noga pozostaje długa",
      "Odepchnij podłoże i wróć do środka",
    ]);
  }
  function stepUp(c, p) {
    const r = rep(p),
      s = pose(
        p,
        [156 + 43 * r, 177 - 74 * r],
        foot(199, 225),
        foot(150 + 29 * r, 264 - 39 * r),
        5,
      );
    s.right.contactSurface = "step";
    s.left.contact = r < 0.06;
    s.left.contactSurface = "floor";
    prop(s, rect(180, 225, 57, 39, "#e1e9ef"), [
      [178, 223],
      [239, F],
    ]);
    hangingArms(s);
    load(s, c);
    return phase(s, p, [
      "Oprzyj całą stopę na podwyższeniu",
      "Wyprostuj nogę na podwyższeniu",
      "Zejdź powoli · nie spadaj z podestu",
    ]);
  }
  function hinge(c, p) {
    const dead = c.variant === "barbell_deadlift" || c.variant === "trap_bar_deadlift",
      r = dead ? 1 - rep(p) : rep(p),
      single = c.variant === "single_leg_romanian_deadlift",
      angle = r * (dead ? 70 : 67),
      hip = [
        160 - 61 * Math.sin((angle * Math.PI) / 180) * (dead ? 1 : 0.75),
        142 + (dead ? 48 : 19) * r,
      ],
      s = pose(p, hip, foot(171), foot(150), angle);
    if (single) {
      s.left = leg(
        hip,
        [(1 - r) * 150 + r * (hip[0] - 108), (1 - r) * 253 + r * (hip[1] - 2)],
        r < 0.03,
        -18 * r,
      );
      s.phase = "Zawias na jednej nodze · biodra ustawione równo";
    }
    if (c.variant === "kickstand_romanian_deadlift")
      s.left = leg(hip, foot(132, 264, -30), true, -30);
    hands(
      s,
      [point(s, 2, -61)[0], point(s, 2, -61)[1] + 67.8],
      [point(s, -4, -61)[0], point(s, -4, -61)[1] + 67.8],
    );
    load(s, c);
    return phase(
      s,
      p,
      dead
        ? [
            "Odepchnij podłoże · prowadź sztangę blisko nóg",
            "Stań prosto bez odchylania pleców",
            "Odłóż ciężar pod kontrolą na podłoże",
          ]
        : [
            "Cofnij biodra · prowadź ciężar blisko nóg",
            "Długie plecy i miękkie kolana",
            "Wyprostuj biodra bez odchylania lędźwi",
          ],
    );
  }
  function bridge(c, p) {
    const r = c.isometric ? 1 : rep(p),
      long = /long_lever|walkout|_30/.test(c.variant),
      theta = -99 - 18 * r,
      shoulder = [112, 238],
      hip = [
        shoulder[0] - 64 * Math.sin((theta * Math.PI) / 180),
        shoulder[1] + 64 * Math.cos((theta * Math.PI) / 180),
      ],
      s = pose(p, hip, foot(long ? 270 : 231), foot(long ? 263 : 222), theta);
    const single = /single_leg/.test(c.variant),
      march = c.variant === "glute_bridge_march";
    if (single || march) {
      const u = single ? 1 : Math.max(0, Math.sin(p * Math.PI * 2));
      s.left = leg(hip, [hip[0] + 40, hip[1] - 40 * u], false, 0);
    }
    if (c.variant === "bridge_walkout") {
      const t = Math.sin(p * Math.PI * 2) ** 2;
      s.right = leg(hip, foot(231 + 43 * t), true);
      s.left = leg(hip, foot(222 + 43 * t), true);
    }
    if (c.variant === "oscillatory_long_lever_bridge") {
      s.hip[1] += 3 * Math.sin(p * Math.PI * 8);
      s.right.knee = M.ik(s.hip, s.right.ankle);
      s.left.knee = M.ik(s.hip, s.left.ankle);
    }

    if (c.variant === "hip_thrust") {
      bench(s, 65, 225, 72);
      s.hip[1] -= 13;
      s.right.knee = M.ik(s.hip, s.right.ankle);
      s.left.knee = M.ik(s.hip, s.left.ankle);
      barbell(s, [s.hip[0] + 2, s.hip[1] + 2]);
    }
    const armShoulder = point(s, 2, -61),
      farShoulder = point(s, -4, -61);
    s.arms = {
      right: {
        shoulder: armShoulder,
        elbow: [armShoulder[0] + 27, armShoulder[1] + 15],
        wrist: [armShoulder[0] + 58, armShoulder[1] + 15],
      },
      left: {
        shoulder: farShoulder,
        elbow: [farShoulder[0] + 24, farShoulder[1] + 15],
        wrist: [farShoulder[0] + 55, farShoulder[1] + 15],
      },
    };
    if (c.equipment === "ball")
      prop(
        s,
        circle(
          (s.right.knee[0] + s.left.knee[0]) / 2,
          (s.right.knee[1] + s.left.knee[1]) / 2,
          9,
          "#b9cbd9",
        ),
        [s.right.knee, s.left.knee],
        true,
      );
    return phase(s, p, [
      "Dociśnij pięty · unieś biodra",
      "Utrzymaj miednicę bez przeprostu pleców",
      "Opuść biodra pod kontrolą",
    ]);
  }
  function curl(c, p) {
    const r = rep(p),
      seated = c.variant === "seated_leg_curl",
      sliding = /slider|swiss/.test(c.variant),
      single = /single_leg/.test(c.variant);
    let s;
    if (seated) {
      const hip = [160, 197],
        knee = [217, 197],
        a = (90 * (1 - r) * Math.PI) / 180,
        ankle = [knee[0] + 56 * Math.sin(a), knee[1] + 56 * Math.cos(a)];
      s = pose(p, hip, ankle, ankle);
      s.right = { knee: [...knee], ankle: [...ankle], contact: false, footAngle: 0 };
      s.left = { knee: [...knee], ankle: [...ankle], contact: false, footAngle: 0 };
      bench(s, 124, 205, 101);
      hands(s, [160, 202], [151, 201]);
      line(s, [272, 262], [272, 187], "#8ba1b2", 4);
      prop(s, circle(ankle[0] + 4, ankle[1] - 5, 7), [ankle], true);
    } else if (sliding) {
      s = bridge({ ...c, variant: "long_lever_hamstring_iso", isometric: true }, p);
      const x = 270 - 39 * r,
        ball = c.equipment === "swiss_ball",
        surface = ball ? 216 : F;
      s.right = leg(s.hip, foot(x, surface), true, 0, ball ? "ball" : "floor");
      s.left = leg(
        s.hip,
        single ? [s.hip[0] + 30, s.hip[1] - 84] : foot(x - 8, surface),
        !single,
        0,
        ball ? "ball" : "floor",
      );
      if (ball) {
        s.supports.ball = { type: "circle", x, y: 240, r: 24 };
        prop(
          s,
          circle(x, 240, 24, "#b7cad9") +
            xmlPath(`M${x - 17},224Q${x + 12},226 ${x + 17},254`, "none", "#849eaf", 1),
          [
            [x - 25, 215],
            [x + 25, F],
          ],
        );
      } else {
        prop(
          s,
          rect(x - 10, 261, 31, 3, "#9db2c2") +
            (!single ? rect(x - 20, 261, 23, 3, "#bacbd7") : ""),
          [
            [x - 20, 261],
            [x + 22, F],
          ],
        );
      }
    } else {
      const knee = [150, 226],
        hip = [207, 226],
        a = (r * Math.PI) / 2,
        ankle = [knee[0] - 56 * Math.cos(a), knee[1] - 56 * Math.sin(a)];
      s = pose(p, hip, ankle, ankle, 90);
      s.right = { knee, ankle, contact: false, footAngle: -80 * r };
      s.left = { knee: [...knee], ankle: [...ankle], contact: false, footAngle: -80 * r };
      bench(s, 132, 242, 182);
      hands(s, [287, 239], [281, 239]);
      if (c.equipment === "band") line(s, [65, 256], ankle, "#bb9464", 2, true);
      else prop(s, circle(ankle[0] - 2, ankle[1] + 4, 8, "#a7bac9"), [ankle], true);
    }
    return phase(s, p, [
      "Przyciągnij pięty przez ugięcie kolan",
      "Utrzymaj biodra i tułów stabilnie",
      "Powoli wyprostuj kolana · kontroluj powrót",
    ]);
  }
  function nordic(c, p) {
    const eccentric = c.variant === "eccentric_nordic_hamstring",
      r = eccentric ? smooth(clamp(p / 0.6)) : rep(p),
      assisted = c.variant === "assisted_nordic_hamstring",
      razor = c.variant === "razor_curl",
      angle = (razor ? 20 : assisted ? 38 : 73) * r,
      a = (angle * Math.PI) / 180,
      knee = [160, 257],
      hip = [160 + 57 * Math.sin(a), 257 - 57 * Math.cos(a)],
      s = pose(p, hip, [104, 257], [106, 257], razor ? 75 * r : angle);
    s.right = {
      knee: [...knee],
      ankle: [104, 257],
      contact: false,
      footAngle: -90,
      contactSurface: "brace",
    };
    s.left = {
      knee: [...knee],
      ankle: [106, 257],
      contact: false,
      footAngle: -90,
      contactSurface: "brace",
    };
    prop(s, rect(88, 246, 32, 15, "#aabecd") + rect(145, 260, 29, 4, "#dce6ed"), [
      [86, 245],
      [177, F],
    ]);
    if (assisted) {
      line(s, [112, 65], point(s, 5, -43), "#b99361", 2);
      hands(s, point(s, 23, -49), point(s, 18, -46));
    } else {
      const target = v(
        point(s, 12, -35),
        [point(s, 0, -61)[0] + 12, Math.min(257, point(s, 0, -61)[1] + 50)],
        smooth(clamp((r - 0.6) / 0.25)),
      );
      hands(s, target, [target[0] - 5, target[1]]);
    }
    if (eccentric) {
      s.opacity = p > 0.75 ? 1 - smooth((p - 0.75) / 0.25) : p < 0.04 ? smooth(p / 0.04) : 1;
      s.phase = "Powoli opadaj od kolan · powrót z pomocą rąk poza pętlą";
      return s;
    }
    return phase(s, p, [
      razor
        ? "Cofaj biodra i pochylaj tułów pod kontrolą"
        : "Opadaj od kolan · utrzymaj linię uda i tułowia",
      "Zahamuj ruch w kontrolowanym zakresie",
      c.variant === "full_nordic_hamstring"
        ? "Wróć z zachowaniem pozycji · w razie potrzeby użyj rąk"
        : "Podeprzyj się rękami lub gumą podczas powrotu",
    ]);
  }
  function press(c, p) {
    let s;
    const r = rep(p);
    if (c.variant === "incline_push_up") {
      const beta = ((34 - 16 * r) * Math.PI) / 180,
        ankle = foot(85, F, 35);
      s = pose(
        p,
        [ankle[0] + 113 * Math.cos(beta), ankle[1] - 113 * Math.sin(beta)],
        ankle,
        foot(94, F, 35),
        90 - (beta * 180) / Math.PI,
      );
      s.right.footAngle = s.left.footAngle = 35;
      hands(s, [270, 199], [261, 199]);
      bench(s, 254, 205, 44);
      return phase(s, p, [
        "Ugnij łokcie · tułów pozostaje w jednej linii",
        "Zbliż klatkę do stabilnego podparcia",
        "Odepchnij podparcie i wróć bez zapadania bioder",
      ]);
    }
    if (c.variant === "push_up") {
      const beta = ((17 - 16 * r) * Math.PI) / 180,
        ankle = foot(85, F, 35),
        hip = [ankle[0] + 113 * Math.cos(beta), ankle[1] - 113 * Math.sin(beta)];
      s = pose(p, hip, ankle, foot(94, F, 35), 90 - (beta * 180) / Math.PI);
      s.right.footAngle = s.left.footAngle = 35;
      hands(s, [255, 257], [246, 257]);
      return phase(s, p, [
        "Ugnij łokcie · całe ciało porusza się razem",
        "Tułów i biodra pozostają w jednej linii",
        "Odepchnij podłoże bez zapadania barków",
      ]);
    }
    if (c.variant === "pike_push_up") {
      s = pose(p, [170, 150 + 11 * r], foot(125), foot(136), 133 + 20 * r);
      hands(s, [228, 257], [219, 257]);
      return phase(s, p, [
        "Z wysokich bioder ugnij łokcie",
        "Prowadź głowę między dłonie",
        "Wyprostuj ramiona · biodra pozostają wysoko",
      ]);
    }
    if (c.variant === "dumbbell_bench_press") {
      s = pose(p, [186, 197], foot(239), foot(226), -90);
      bench(s, 72, 210, 145);
      hands(s, [139, 135 + 45 * (1 - r)], [128, 135 + 45 * (1 - r)]);
      load(s, c);
      return phase(s, p, [
        "Wyciśnij hantle nad klatkę",
        "Utrzymaj łopatki i stopy stabilnie",
        "Opuść hantle spokojnie do boków klatki",
      ]);
    }
    let up = r,
      dip = 0;
    if (c.variant === "push_press") {
      dip = p < 0.17 ? smooth(p / 0.17) : p < 0.35 ? 1 - smooth((p - 0.17) / 0.18) : 0;
      up =
        p < 0.17
          ? 0
          : p < 0.48
            ? smooth((p - 0.17) / 0.31)
            : p < 0.65
              ? 1
              : 1 - smooth((p - 0.65) / 0.35);
    }
    s = pose(p, [160, 142 + 23 * dip], foot(171), foot(150));
    hands(s, point(s, 12, -54 - 74 * up), point(s, 4, -54 - 74 * up));
    load(s, c.variant === "push_press" ? { ...c, equipment: "barbell" } : c);
    return phase(
      s,
      p,
      c.variant === "push_press"
        ? [
            "Krótki dip · wyprost nóg rozpoczyna ruch",
            "Przenieś napęd z nóg na sztangę",
            "Opuść sztangę na barki pod kontrolą",
          ]
        : [
            "Wyciśnij ciężar nad barki",
            "Żebra i miednica pozostają ustawione",
            "Opuść ciężar bez wyginania lędźwi",
          ],
    );
  }
  function pull(c, p) {
    const r = rep(p);
    let s;
    if (c.variant === "one_arm_dumbbell_row") {
      s = pose(p, [180, 175], foot(190), [92, 222], 75);
      s.left = { knee: [148, 222], ankle: [92, 222], contact: false, footAngle: -10 };
      bench(s, 115, 225, 158);
      hands(s, v([242, 224], [193, 183], r), [244, 218]);
      load(s, c);
      return phase(s, p, [
        "Pociągnij hantel w stronę biodra",
        "Nie obracaj tułowia · podparcie pozostaje stabilne",
        "Opuść ciężar do długiego ramienia",
      ]);
    }
    if (c.variant === "bodyweight_row") {
      const b = ((20 + 18 * r) * Math.PI) / 180,
        ankle = foot(260),
        hip = [260 - 113 * Math.cos(b), 253 - 113 * Math.sin(b)];
      s = pose(p, hip, ankle, foot(254), (b * 180) / Math.PI - 90);
      hands(s, [120, 133], [113, 133]);
      line(s, [82, F], [82, 133], "#8ba1b2", 3);
      line(s, [82, 133], [183, 133], "#607e95", 4);
      return phase(s, p, [
        "Przyciągnij klatkę w stronę drążka",
        "Biodra i tułów pozostają w jednej linii",
        "Powoli wyprostuj ramiona",
      ]);
    }
    if (c.variant === "pull_up") {
      s = pose(p, [160, 173 - 50 * r], [132, 247 - 25 * r], [126, 242 - 25 * r]);
      s.right.contact = s.left.contact = false;
      hands(s, [170, 50], [158, 50]);
      line(s, [107, 50], [219, 50], "#607e95", 4);
      return phase(s, p, [
        "Przyciągnij ciało do drążka · bez zamachu",
        "Zbliż brodę do poziomu drążka",
        "Opuść się pod kontrolą do długich ramion",
      ]);
    }
    if (c.variant === "lat_pulldown") {
      s = pose(p, [160, 197], foot(217), foot(205));
      bench(s, 122, 207, 96);
      const h = hands(s, [174, 80 + 67 * r], [161, 80 + 67 * r]);
      line(s, [169, 52], [169, h.right[1]], "#a1b4c2", 1.4);
      barbell(s, [(h.right[0] + h.left[0]) / 2, h.right[1]], true);
      prop(s, rect(85, 185, 25, 68, "#dae4eb") + xmlPath("M95,185V52H169", "none", "#9aafbf", 3), [
        [84, 50],
        [185, 255],
      ]);
      return phase(s, p, [
        "Ściągnij drążek do górnej części klatki",
        "Nie odchylaj gwałtownie tułowia",
        "Oddaj drążek spokojnie do góry",
      ]);
    }
    s = pose(p);
    const h = hands(s, v([221, 83], [173, 69], r), v([216, 87], [167, 72], r), -1);
    line(s, [282, 77], h.right, "#b68e5b", 1.5);
    line(s, [282, 79], h.left, "#b68e5b", 1.5);
    return phase(s, p, [
      "Przyciągnij gumę w stronę twarzy",
      "Łokcie prowadź na boki · nie unoś barków",
      "Wyprostuj ręce bez utraty ustawienia",
    ]);
  }
  function floorBack(p) {
    const s = pose(p, [174, 237], [222, 180], [211, 183], -90);
    s.right.contact = s.left.contact = false;
    hands(s, [119, 178], [108, 178]);
    return s;
  }
  function quadruped(p) {
    const s = pose(p, [166, 200], [112, 253], [105, 253], 90);
    s.right.knee = [166, 257];
    s.left.knee = [160, 257];
    hands(s, [232, 257], [221, 257]);
    return s;
  }
  function core(c, p) {
    const r = rep(p),
      id = c.variant;
    let s;
    if (id === "dead_bug") {
      s = floorBack(p);
      s.right = leg(s.hip, v([226, 180], [280, 230], r), false);
      hands(s, v([119, 178], [52, 226], r), [108, 178]);
      return phase(s, p, [
        "Oddal przeciwną rękę i nogę",
        "Nie odrywaj lędźwi · oddychaj",
        "Wróć i wykonaj drugą stronę",
      ]);
    }
    if (id === "bird_dog") {
      s = quadruped(p);
      s.left = leg(s.hip, v([105, 253], [55, 197], r), false);
      hands(s, v([232, 257], [292, 200], r), [221, 257]);
      return phase(s, p, [
        "Wyprostuj przeciwną rękę i nogę",
        "Biodra i barki pozostają równolegle do podłoża",
        "Spokojnie wróć do podporu",
      ]);
    }
    if (id === "pallof_press") {
      s = pose(p, [160, 148], foot(185), foot(134), 0, "front");
      const h = hands(s, [160 + 38 * r, 104], [154 + 38 * r, 105]);
      line(s, [71, 102], h.right, "#b58d5d", 2, true);
      return phase(s, p, [
        "Oddal dłonie od klatki piersiowej",
        "Nie skręcaj tułowia w stronę gumy",
        "Przyciągnij dłonie bez utraty ustawienia",
      ]);
    }
    if (id === "bodyweight_march_hold") {
      s = pose(p);
      s.left = leg(s.hip, [204, 199], false, -8);
      hands(s, point(s, 20, -45), point(s, -15, -15));
      s.phase = "Utrzymaj wysokie kolano · biodra równo · oddychaj";
      return s;
    }
    if (id === "side_plank" || id === "copenhagen_plank") {
      const elevated = id === "copenhagen_plank",
        ankle = elevated ? [280, 209] : foot(275),
        angle = elevated ? -95.6 : -81.1,
        hip = [
          ankle[0] + 113 * Math.sin((angle * Math.PI) / 180),
          ankle[1] - 113 * Math.cos((angle * Math.PI) / 180),
        ];
      s = pose(p, hip, ankle, ankle, angle);
      s.right = leg(hip, ankle, true, 0, elevated ? "bench" : "floor");
      s.left = leg(hip, elevated ? [228, 244] : foot(272), !elevated, 0);
      if (elevated) bench(s, 261, 220, 54);
      const shoulder = point(s, 2, -61);
      s.arms = {
        right: { shoulder, elbow: [shoulder[0] - 2, 257], wrist: [shoulder[0] + 29, 257] },
        left: { shoulder: point(s, -4, -61), elbow: point(s, -9, -25), wrist: point(s, 0, 4) },
      };
      s.phase = elevated
        ? "Górna noga oparta na ławce · utrzymaj linię bioder"
        : "Oprzyj przedramię · utrzymaj bark, biodro i kostkę w linii";
      return s;
    }
    const a = foot(62, F, 32),
      beta = (7.5 * Math.PI) / 180,
      hip = [a[0] + 113 * Math.cos(beta), a[1] - 113 * Math.sin(beta)];
    s = pose(p, hip, a, foot(70, F, 32), 82.5);
    s.right.footAngle = s.left.footAngle = 32;
    const sh = point(s, 2, -61);
    s.arms = {
      right: { shoulder: sh, elbow: [sh[0] + 6, sh[1] + 35], wrist: [sh[0] + 37, sh[1] + 39] },
      left: {
        shoulder: point(s, -4, -61),
        elbow: [sh[0], sh[1] + 35],
        wrist: [sh[0] + 31, sh[1] + 39],
      },
    };
    s.phase = "Utrzymaj podpór na przedramionach · napnij brzuch i spokojnie oddychaj";
    return s;
  }
  function ankle(c, p) {
    const r = c.isometric ? 1 : rep(p),
      id = c.variant;
    let s;
    if (id === "seated_soleus_raise") {
      s = pose(p, [154, 197], foot(217, F, 28 * r), foot(208, F, 28 * r));
      s.right.knee = [211, 197 - 4 * r];
      s.left.knee = [204, 197 - 4 * r];
      s.right.footAngle = s.left.footAngle = 28 * r;
      bench(s, 110, 209, 87);
      hands(s, [203, 178 - 4 * r], [195, 178 - 4 * r]);
      dumbbell(s, [211, 187 - 4 * r]);
      return phase(s, p, [
        "Unieś pięty · kolana pozostają ugięte",
        "Dociśnij przodostopie bez kołysania",
        "Powoli opuść pięty",
      ]);
    }
    if (id === "tibialis_raise") {
      s = pose(p, [155, 153], foot(190, F, -24 * r), foot(180, F, -24 * r), -8);
      s.right.footAngle = s.left.footAngle = -24 * r;
      line(s, [143, 38], [143, F], "#a7b8c5", 4);
      hands(s, point(s, 3, -9), point(s, -5, -10));
      return phase(s, p, [
        "Unieś palce · pięty pozostają na podłożu",
        "Oprzyj plecy o ścianę",
        "Powoli opuść przodostopie",
      ]);
    }
    const angle = 28 * r,
      bent = id === "soleus_iso_hold";
    s = pose(
      p,
      [160, 142 - (M.sole(angle).lowest - 11) + (bent ? 23 : 0)],
      foot(171, F, angle),
      foot(153, F, angle),
      bent ? 8 : 0,
    );
    s.right.footAngle = s.left.footAngle = angle;
    hands(s, [217, 98], [217, 99]);
    line(s, [225, 36], [225, F], "#a7b8c5", 4);
    return phase(
      s,
      p,
      bent
        ? [
            "Ugnij kolana i unieś pięty",
            "Utrzymuj napięcie łydki · oddychaj",
            "Zakończ utrzymanie spokojnie",
          ]
        : [
            "Unieś pięty · kolana pozostają długie",
            "Podeprzyj dłoń dla równowagi",
            "Opuść pięty pod kontrolą",
          ],
    );
  }
  function walk(c, p) {
    const hip = [160, 146 - 2 * Math.cos(p * Math.PI * 4)],
      s = pose(p, hip);
    for (const [side, offset] of [
      ["right", 0],
      ["left", 0.5],
    ]) {
      const q = mod(p + offset),
        support = 0.62,
        x =
          q < support ? 178 - (39 * q) / support : 139 + 39 * smooth((q - support) / (1 - support)),
        angle = q < support ? 8 * Math.sin((q / support) * Math.PI) : 0,
        y = q < support ? F : F - 13 * Math.sin(((q - support) / (1 - support)) * Math.PI);
      s[side] = leg(hip, foot(x, y, angle), q < support, angle);
    }
    s.armDrive = Math.sin(p * Math.PI * 2) * 0.35;
    s.groundOffset = p * 63;
    s.phase = "Spokojny marsz · zawsze przynajmniej jedna stopa na ziemi";
    return s;
  }
  function carry(c, p) {
    const s = walk(c, p);
    s.armDrive = 0;
    s.torsoAngle = 0;
    const high = c.variant === "overhead_carry",
      rack = c.variant === "front_rack_carry";
    if (high) hands(s, point(s, 7, -127), point(s, -5, -123));
    else if (rack) hands(s, point(s, 17, -51), point(s, 6, -51));
    else hangingArms(s);
    load(s, c);
    s.phase = high
      ? "Krótkie kroki · ciężar nad barkiem i stabilny tułów"
      : rack
        ? "Krótkie kroki · kettlebelle przy barkach"
        : "Idź spokojnie · barki równo · nie przechylaj tułowia";
    return s;
  }
  function machine(c, p) {
    const r = rep(p);
    let s;
    if (c.variant === "leg_extension") {
      const knee = [217, 197],
        a = (90 * r * Math.PI) / 180,
        ankle = [217 + 56 * Math.sin(a), 197 + 56 * Math.cos(a)];
      s = pose(p, [160, 197], ankle, ankle);
      s.right = { knee, ankle, contact: false, footAngle: 0 };
      s.left = { knee: [213, 197], ankle: [ankle[0] - 4, ankle[1]], contact: false, footAngle: 0 };
      bench(s, 124, 209, 101);
      hands(s, [157, 202], [150, 201]);
      prop(s, circle(ankle[0] + 3, ankle[1] - 5, 8), [ankle], true);
      s.phase =
        p < 0.5
          ? "Wyprostuj kolana · biodra pozostają na siedzisku"
          : "Powoli ugnij kolana · nie puszczaj ciężaru";
    } else {
      const hip = [150, 216],
        target = v([212, 159], [250, 169], r);
      s = pose(p, hip, target, [target[0] - 5, target[1] + 2], -35);
      s.right.contactSurface = s.left.contactSurface = "plate";
      hands(s, [123, 224], [116, 221]);
      prop(
        s,
        xmlPath("M88,127L145,224H180M171,264L280,113M191,264L300,113", "none", "#9cabb8", 5) +
          xmlPath(`M${target[0] - 8},${target[1] - 17}l24,35`, "none", "#58758c", 6),
        [
          [85, 112],
          [302, F],
        ],
      );
      s.phase =
        p < 0.5
          ? "Odepchnij platformę · plecy i miednica oparte"
          : "Ugnij kolana w kontrolowanym zakresie · nie odrywaj miednicy";
    }
    return s;
  }
  function backExtension(c, p) {
    const r = rep(p),
      hip = [178, 176],
      s = pose(p, hip, foot(108), foot(101), 45 + 49 * r);
    prop(
      s,
      xmlPath("M85,261L186,178L206,196M160,264L179,186", "none", "#92a7b8", 5) +
        rect(166, 179, 38, 10, "#c3d3df"),
      [
        [82, 174],
        [208, F],
      ],
    );
    hands(s, point(s, 15, -49), point(s, 8, -45));
    return phase(s, p, [
      "Zrób zawias biodrowy nad podparciem",
      "Długie plecy · ruch z biodra",
      "Wróć do linii ciała bez przeprostu",
    ]);
  }
  function powerLift(c, p) {
    let s;
    const clean = c.variant === "power_clean",
      swing = c.variant === "kettlebell_swing";
    if (swing) {
      const r = rep(p),
        angle = 64 * (1 - r),
        hip = [160 - 44 * (1 - r), 142 + 20 * (1 - r)];
      s = pose(p, hip, foot(177), foot(144), angle);
      hands(s, v([178, 200], [229, 81], r), v([173, 202], [223, 83], r));
      load(s, c);
      s.phase =
        p < 0.44
          ? "Wyprost bioder rozpędza kettlebell · nie podnoś samymi rękami"
          : p < 0.56
            ? "Kettlebell płynie do wysokości klatki"
            : "Pozwól ciężarowi wrócić · cofnij biodra";
      return s;
    }
    const pull = p < 0.38 ? smooth(p / 0.38) : p < 0.52 ? 1 : 1 - smooth((p - 0.52) / 0.48),
      catchWeight = clean
        ? smooth(clamp((p - 0.36) / 0.14)) * (1 - smooth(clamp((p - 0.72) / 0.14)))
        : 0,
      catching = catchWeight > 0.5,
      catchDepth =
        clean && p >= 0.4 && p < 0.78
          ? p < 0.54
            ? smooth((p - 0.4) / 0.14)
            : 1 - smooth((p - 0.54) / 0.24)
          : 0,
      angle = 30 * (1 - pull);
    s = pose(
      p,
      [160 - 18 * (1 - pull), 142 + 12 * (1 - pull) + 33 * catchDepth],
      foot(174),
      foot(148),
      M.mix(angle, 8, catchWeight),
    );
    {
      const shoulder = point(s, 2, -61),
        h = hands(
          s,
          [shoulder[0] + 7, shoulder[1] + 64 * (1 - pull) + 19 * pull],
          [shoulder[0] - 3, shoulder[1] + 64 * (1 - pull) + 21 * pull],
        );
      if (clean && catchWeight > 0) {
        const pulling = Object.fromEntries(
          ["right", "left"].map((side) => [
            side,
            scope.BWDrawHuman.armPoints(s, side, s.torsoAngle, false),
          ]),
        );
        rackArms(s, true);
        for (const side of ["right", "left"])
          for (const joint of ["shoulder", "elbow", "wrist"])
            s.arms[side][joint] = v(pulling[side][joint], s.arms[side][joint], catchWeight);
        barbell(s, v(s.arms.right.wrist, s.arms.left.wrist, 0.5));
      } else barbell(s, v(h.right, h.left, 0.5));
    }
    s.phase = catching
      ? "Zarzut z zawisu · szybki chwyt z przodu i wyprost"
      : p < 0.38
        ? "Z zawisu · wyprost bioder i kolan prowadzi sztangę"
        : p < 0.52
          ? "Pociągnięcie z zawisu · łokcie w górę, bez chwytu na barkach"
          : "Opuść sztangę pod kontrolą do zawisu";
    return s;
  }
  function jump(c, p) {
    const id = c.variant,
      single = /single_leg/.test(id),
      splitJump = id === "split_squat_jump",
      drop = id === "drop_landing" || id === "depth_jump",
      box = id === "box_jump",
      hurdle = id === "hurdle_hops",
      horizontal = /broad|diagonal/.test(id);
    if (id === "single_leg_pogo") {
      const s = A.models.single_leg_hops.sample(p);
      s.props = { back: "", front: "", points: [] };
      s.phase = "Sprężysty podskok jednonóż · krótki kontakt pod biodrem";
      return s;
    }
    if (id === "repeated_broad_jump") {
      const s = A.models.broad_jump.sample(p);
      s.props = { back: s.extras ?? "", front: "", points: [] };
      s.phase = "Skok obunóż w dal · " + s.phase;
      return s;
    }
    if (id === "diagonal_bound_to_stick") {
      const s = A.models.lateral_bound_to_stick.sample(p);
      s.props = { back: s.extras ?? "", front: "", points: [] };
      s.phase = "Skok ukośny i stabilizacja · widok składowej bocznej · " + s.phase;
      return s;
    }
    let ground = F,
      x = 160,
      y = 142,
      bend = 0,
      air = false;
    if (drop) {
      if (p < 0.2) {
        ground = 228;
        x = 134;
        y = 106;
      } else if (p < 0.4) {
        const t = smooth((p - 0.2) / 0.2);
        ground = 228 + 36 * t;
        x = 134 + 44 * t;
        y = 106 + 36 * t;
        air = true;
      } else if (p < 0.58) {
        x = 178;
        y = 142 + 35 * Math.sin(((p - 0.4) / 0.18) * Math.PI);
        bend = (y - 142) / 35;
      } else if (id === "depth_jump" && p < 0.8) {
        const t = (p - 0.58) / 0.22;
        x = 178;
        y = 142 - 48 * Math.sin(t * Math.PI);
        ground = F - 48 * Math.sin(t * Math.PI);
        air = true;
      } else {
        x = 178;
        y =
          142 +
          20 *
            Math.sin(
              clamp(
                (p - (id === "drop_landing" ? 0.58 : 0.8)) / (id === "drop_landing" ? 0.42 : 0.2),
              ) * Math.PI,
            );
        bend = (y - 142) / 35;
      }
    } else if (p < 0.2) {
      bend = id === "squat_jump" ? 1 : smooth(p / 0.2);
      y += 34 * bend;
    } else if (p < 0.3) {
      bend = 1 - smooth((p - 0.2) / 0.1);
      y += 34 * bend;
    } else if (p < 0.64) {
      const t = (p - 0.3) / 0.34;
      air = true;
      const elev = box ? 39 * smooth(t) : 0,
        lift = 48 * Math.sin(t * Math.PI);
      x += box ? 74 * smooth(t) : hurdle ? 74 * smooth(t) : horizontal ? 85 * smooth(t) : 0;
      ground = F - elev - lift;
      y = 142 - elev - lift;
      bend = 0.12 * Math.sin(t * Math.PI);
    } else {
      const t = (p - 0.64) / 0.36;
      ground = box ? 225 : F;
      x += box || hurdle ? 74 : horizontal ? 85 : 0;
      bend = 0.8 * Math.sin(t * Math.PI);
      y = 142 - (box ? 39 : 0) + 34 * bend;
    }
    const s = pose(
      p,
      [x - 12 * bend, y + (splitJump ? 7 : 0)],
      foot(x + 13, ground),
      foot(x - 9, ground),
      18 * bend,
    );
    s.right.contact = s.left.contact = !air;
    s.right.contactSurface = s.left.contactSurface =
      box && p >= 0.64 ? "step" : drop && p < 0.2 ? "box" : "floor";
    if (single) {
      s.left = leg(s.hip, [x + 40, y + 55], false, -15);
    }
    if (splitJump) {
      const exchange = smooth(clamp((p - 0.3) / 0.34)),
        offset = 42 * (1 - 2 * exchange);
      s.right = leg(s.hip, foot(x + offset, ground), !air);
      s.left = leg(s.hip, foot(x - offset, ground), !air);
    }
    if (drop)
      prop(s, rect(93, 228, 56, 36), [
        [91, 226],
        [151, F],
      ]);
    if (box)
      prop(s, rect(220, 225, 57, 39), [
        [218, 223],
        [279, F],
      ]);
    if (hurdle)
      prop(s, xmlPath("M202,264V239H218V264", "none", "#b3966c", 3), [
        [200, 237],
        [220, F],
      ]);
    if (c.equipment === "barbell_back") rackArms(s);
    else if (c.equipment === "dumbbells" || c.equipment === "trapbar") hangingArms(s);
    else {
      const armUp = smooth(clamp((p - 0.16) / 0.16)) * (1 - smooth(clamp((p - 0.64) / 0.25)));
      hands(
        s,
        point(s, 22 + 6 * armUp, -20 - 71 * armUp),
        point(s, 16 + 4 * armUp, -18 - 68 * armUp),
      );
    }
    load(s, c);
    if (c.equipment === "assist_band") {
      const h = hands(s, point(s, 12, -83), point(s, 5, -82));
      line(s, [x, 5], h.right, "#b58d5d", 2);
      line(s, [x - 5, 5], h.left, "#b58d5d", 2);
    }
    s.phase = air
      ? "Lot · zachowaj kontrolę i przygotuj stopy do lądowania"
      : p < 0.24
        ? drop
          ? "Zejdź z podestu · nie odbijaj się z niego"
          : id === "squat_jump"
            ? "Zatrzymaj pozycję półprzysiadu przed odbiciem"
            : "Przygotuj krótki zamach i ugięcie nóg"
        : drop && p < 0.58
          ? "Amortyzuj lądowanie · biodra i kolana uginają się razem"
          : "Wyląduj stabilnie · kolana w kierunku palców";
    if (p > 0.94) {
      s.opacity = 1 - smooth((p - 0.94) / 0.06);
    } else if (p < 0.05) {
      s.opacity = smooth(p / 0.05);
    }
    return s;
  }
  function throwSetup(c, p) {
    const id = c.variant,
      back = id === "medicine_ball_overhead_backward_throw",
      rotation = id === "medicine_ball_rotational_scoop_toss",
      slam = id === "medicine_ball_slam",
      t = smooth(clamp(p / 0.48)),
      s = pose(
        p,
        [160 - 12 * (1 - t), 142 + 24 * (1 - t) + (slam ? 15 * t : 0)],
        foot(180),
        foot(140),
        rotation ? 0 : slam ? 50 * t : 15 * (1 - t),
        rotation ? "front" : "side",
      );
    const local = rotation
        ? v([-18, -16], [44, -58], t)
        : slam
          ? v([8, -122], [48, -25], t)
          : back
            ? v([20, -10], [-8, -122], t)
            : v([22, -47], [65, -60], t),
      h = hands(s, point(s, ...local), point(s, local[0] - 7, local[1] + 1));
    return { s, at: v(h.right, h.left, 0.5), back, rotation, slam };
  }
  function medicineThrow(c, p) {
    const { s, at, back, rotation, slam } = throwSetup(c, p),
      release = 0.48,
      flight = clamp((p - release) / 0.3),
      origin = throwSetup(c, release).at,
      target = back ? [51, 124] : slam ? [240, 253] : [306, 130],
      ball = p < release ? at : v(origin, target, flight);
    if (p >= release && !slam) ball[1] -= 40 * Math.sin(flight * Math.PI);
    prop(
      s,
      circle(ball[0], ball[1], 10, "#b98e64"),
      [
        [ball[0] - 11, ball[1] - 11],
        [ball[0] + 11, ball[1] + 11],
      ],
      true,
    );
    s.phase =
      p < release
        ? rotation
          ? "Odepchnij podłoże · przenieś rotację bioder na piłkę"
          : slam
            ? "Z długiej pozycji skieruj piłkę mocno w dół"
            : back
              ? "Wyprost nóg i bioder · rzut za siebie"
              : "Wyprostuj ramiona i wyrzuć piłkę przed siebie"
        : "Wypuść piłkę · zachowaj równowagę i wolną przestrzeń";
    if (p > 0.82) s.opacity = 1 - smooth((p - 0.82) / 0.18);
    return s;
  }
  function run(c, p) {
    const id = c.variant,
      steady =
        id === "easy_aerobic_run" ||
        id === "field_mas_5_min_test" ||
        id === "tempo_conditioning_block",
      shuttle = id === "repeated_shuttle_sprints",
      curve = id === "repeated_curved_sprints",
      model = curve
        ? "football_curved_sprint"
        : shuttle
          ? "planned_505"
          : steady
            ? "bwprep:run"
            : "max_velocity_high_volume",
      s = steady ? A.runningSample(p, 3, 0.35) : A.models[model].sample(p);
    s.props = { back: s.extras ?? "", front: "", points: [] };
    s.phase =
      (shuttle
        ? "Bieg wahadłowy · hamowanie i nawrót"
        : curve
          ? "Powtarzane biegi po łuku"
          : steady
            ? "Swobodny rytm biegu"
            : "Odcinek biegowy · odpoczynek uruchamiasz stoperem sesji") +
      " · " +
      s.phase;
    return s;
  }
  function resistedRun(c, p) {
    const hill = c.variant === "hill_acceleration",
      assist = c.variant === "assisted_straight_sprint",
      s = A.models.acceleration_mechanics.sample(p);
    s.props = { back: "", front: "", points: [] };
    s.supports = { floor: { type: "line", y: F } };
    if (hill) {
      const angle = -8,
        origin = [154, F],
        transform = (q) => add(origin, rot([q[0] - origin[0], q[1] - origin[1]], angle));
      s.hip = transform(s.hip);
      for (const side of ["right", "left"]) {
        s[side].knee = transform(s[side].knee);
        s[side].ankle = transform(s[side].ankle);
        s[side].footAngle += angle;
      }
      s.torsoAngle += angle;
      s.supports.floor = { type: "slope", origin, angle };
      s.groundLine = "M-300,327.8L700,187.3";
      s.phase = "Przyspieszenie pod łagodne wzniesienie · zachowaj linię pchnięcia";
    } else {
      const anchor = assist ? [294, 142] : [46, 149];
      line(s, anchor, s.hip, "#ba9363", 3);
      prop(s, circle(anchor[0], anchor[1], 5, "#7891a5"), [anchor]);
      s.phase = assist
        ? "Bieg z delikatnym wspomaganiem · bez utraty kontroli"
        : "Bieg z oporem gumy z tyłu · biodra stabilnie";
    }
    return s;
  }
  function preparation(c, p) {
    const id = c.variant,
      r = /^stretch_/.test(id) ? 0.8 * hold(p) : rep(p);
    let s;
    if (id === "walk") return walk(c, p);
    if (id === "squat") return squat({ variant: "bodyweight_squat" }, p);
    if (id === "bridge") return bridge({ variant: "glute_bridge" }, p);
    if (id === "stretch_calf" || id === "stretch_soleus") {
      const bent = id === "stretch_soleus";
      s = pose(p, [167, 165 + (bent ? 15 : 0)], foot(213), foot(107), 20);
      if (!bent) {
        s.left.knee = v(s.hip, s.left.ankle, 57 / 113);
      }
      hands(s, [235, 112], [235, 119]);
      line(s, [241, 36], [241, F], "#acbcc8", 4);
      s.phase = bent
        ? "Tylne kolano lekko ugięte · pięta pozostaje na ziemi"
        : "Tylne kolano długie · pięta pozostaje na ziemi";
      return s;
    }
    if (id === "stretch_quad") {
      s = pose(p, [160, 145], foot(172), [142, 156], -3);
      s.left = leg(s.hip, [132, 145], false, -50);
      hands(s, [209, 111], [132, 145], -1);
      line(s, [217, 48], [217, F], "#acbcc8", 4);
      s.phase = "Przytrzymaj stopę z tyłu · kolana blisko · nie wyginaj lędźwi";
      return s;
    }
    if (id === "stretch_hamstring") {
      const hip = [154 - 10 * r, 199],
        rear = [105, 253];
      s = pose(p, hip, foot(242, F, -20), rear, 18 + 16 * r);
      s.right = leg(hip, foot(242, F, -20), true, -20);
      s.left = { knee: [150, 256], ankle: rear, contact: false, footAngle: -5 };
      hands(s, point(s, 24, -15), point(s, 17, -13));
      s.phase = "Z półklęku cofnij biodra · przednia noga długa · plecy neutralnie";
      return s;
    }
    if (id === "hip_rock") {
      s = pose(p, [156 + 18 * r, 201], foot(215), [96, 251], 7);
      s.left = {
        knee: [s.hip[0] - 10, 257],
        ankle: [s.hip[0] - 65, 251],
        contact: false,
        footAngle: 20,
      };
      hands(s, [208, 186], [201, 188]);
      s.phase = "W półklęku przesuń biodra lekko do przodu · bez przeprostu pleców";
      return s;
    }
    if (id === "adductor_rockback") {
      s = quadruped(p);
      s.view = "side";
      s.hip = [160 - 15 * r, 222 + 6 * r];
      s.torsoAngle = 65;
      s.right = { knee: v(s.hip, foot(254), 0.504), ankle: foot(254), contact: true, footAngle: 0 };
      s.left = { knee: [133, 254], ankle: [91, 242], contact: false, footAngle: 0 };
      hands(s, [235, 252], [213, 243]);
      s.phase = "Jedna noga w bok · cofnij biodra, pozostawiając dłonie w podporze";
      return s;
    }
    s = quadruped(p);
    if (id === "rotation") {
      s.view = "front";
      s.hip[1] = 218;
      s.torsoAngle = 85;
      const sh = point(s, 15, -61);
      s.arms = {
        right: {
          shoulder: sh,
          elbow: [sh[0] + 8, sh[1] - 34 * r],
          wrist: [sh[0] + 12, sh[1] - 62 * r],
        },
        left: { shoulder: point(s, -15, -61), elbow: [219, 224], wrist: [238, 257] },
      };
      s.phase = "Dłoń przy głowie lub ramię w górę · otwieraj klatkę bez obracania bioder";
    } else {
      s.spineCurve = 12 * Math.sin(p * Math.PI * 2);
      s.headAngle = 9 * Math.sin(p * Math.PI * 2);
      s.phase =
        Math.sin(p * Math.PI * 2) > 0
          ? "Spokojnie zaokrąglij plecy · wydech"
          : "Łagodnie wydłuż przód tułowia · wdech";
    }
    return s;
  }
  function mobilitySequence(c, p) {
    const ids =
      c.variant === "hip_mobility_flow"
        ? ["hip_rock", "adductor_rockback", "rotation"]
        : c.variant === "ankle_mobility_flow"
          ? ["stretch_calf", "stretch_soleus"]
          : ["stretch_calf", "stretch_hamstring", "stretch_quad", "hip_rock"];
    const stage = Math.min(ids.length - 1, Math.floor(p * ids.length)),
      q = mod(p * ids.length),
      s = preparation({ variant: ids[stage] }, q);
    s.sequenceId = ids[stage];
    s.sequenceIndex = stage;
    s.sequenceLength = ids.length;
    s.phase = stage + 1 + "/" + ids.length + " · " + s.phase;
    s.opacity = Math.min(1, q / 0.04, (1 - q) / 0.04);
    return s;
  }
  function cycle(c, p) {
    const hip = [147, 181],
      s = pose(p, hip, [0, 0], [0, 0], 28),
      crank = [198, 230],
      radius = 22;
    for (const [side, offset] of [
      ["right", 0],
      ["left", 0.5],
    ]) {
      const a = (p + offset) * Math.PI * 2,
        target = [crank[0] + radius * Math.cos(a), crank[1] + radius * Math.sin(a) - 10];
      s[side] = leg(hip, target, true, 0, "pedal");
    }
    hands(s, [221, 151], [217, 155]);
    prop(
      s,
      circle(101, 237, 27, "none") +
        circle(248, 237, 27, "none") +
        xmlPath(
          "M101,237L147,181L198,230L101,237L166,208L248,237L224,153H213M147,181H133",
          "none",
          "#819bac",
          3,
        ) +
        circle(...crank, 9, "#b9cbd8"),
      [
        [72, 150],
        [277, F],
      ],
    );
    line(s, crank, [s.right.ankle[0], s.right.ankle[1] + 10], "#637f94", 2);
    s.phase = "Spokojnie pedałuj · płynny, lekki opór";
    return s;
  }
  function breathing(c, p) {
    const s = floorBack(p);
    s.right = leg(s.hip, foot(229), true);
    s.left = leg(s.hip, foot(220), true);
    hands(s, point(s, 8, -31), point(s, -1, -28));
    s.breath = 0.5 - 0.5 * Math.cos(p * Math.PI * 2);
    s.phase =
      p < 0.5
        ? "Spokojny wdech · żebra rozszerzają się na boki"
        : "Dłuższy swobodny wydech · rozluźnij barki";
    return s;
  }
  function football(c, p) {
    const id = c.variant,
      mastery =
        id === "football_ball_mastery" ||
        id === "football_easy_contacts" ||
        id === "football_technical_self_selected",
      pass =
        id === "football_wall_first_touch" ||
        id === "football_target_pass" ||
        id === "football_gk_distribution",
      scan = id === "football_scan_control",
      turn = id === "football_turn_control",
      r = rep(p);
    let s = pose(p, [160, 150], foot(183), foot(138), 5, mastery ? "front" : "side"),
      ball = [193, F - 8];
    if (mastery) {
      const cycle = Math.cos(p * Math.PI * 2),
        x = 160 + 22 * cycle;
      ball = [x, F - 8];
      for (const [side, sign, base] of [
        ["right", 1, 183],
        ["left", -1, 138],
      ]) {
        const weight = Math.max(0, cycle * sign) ** 2;
        s[side] = leg(
          s.hip,
          v(foot(base), [x + sign * 12, 245], weight),
          weight < 1e-5,
          -8 * weight,
        );
      }
      s.phase =
        id === "football_technical_self_selected"
          ? "Przykład: krótkie kontakty obiema nogami · własny element wybierasz w sesji"
          : "Delikatne kontakty wewnętrzną stroną · piłka blisko obu stóp";
    } else {
      const touch = p < 0.3 ? smooth(p / 0.3) : p < 0.5 ? 1 : 1 - smooth((p - 0.5) / 0.5);
      const lift = 14 * Math.sin(touch * Math.PI) + 2 * touch;
      s.right = leg(s.hip, foot(183 + 23 * touch, F - lift, 8 * touch), lift < 0.001, 8 * touch);
      ball =
        p < 0.3
          ? v([245, F - 8], [201, F - 8], smooth(p / 0.3))
          : p < 0.5
            ? v([201, F - 8], [216, F - 8], smooth((p - 0.3) / 0.2))
            : v([216, F - 8], [pass ? 287 : 239, F - 8], smooth((p - 0.5) / 0.5));
      if (turn) {
        s.opacity = smooth(clamp(Math.abs(p - 0.52) / 0.04));
        s.facing = p > 0.52 ? -1 : 1;
        s.mirrorX = 180;
        ball[0] = p > 0.52 ? 360 - ball[0] : ball[0];
        s.phase = "Przyjmij kierunkowo · ustaw ciało i wyprowadź piłkę do boku";
      } else
        s.phase =
          p < 0.3
            ? scan
              ? "Spójrz przed siebie przed kontaktem z piłką"
              : "Przygotuj ustawienie przed przyjęciem"
            : p < 0.5
              ? "Miękki kontakt · skieruj piłkę w wolną stronę"
              : pass
                ? "Zagraj wewnętrzną stroną stopy w wybraną strefę"
                : "Przyjmij i utrzymaj piłkę w zasięgu kroku";
      if (id === "football_wall_first_touch") line(s, [300, 167], [300, F], "#a4b8c6", 5);
      if (pass)
        prop(s, xmlPath("M274,264l4,-13 4,13ZM300,264l4,-13 4,13Z", "#b79868", "#9e8159", 1), [
          [271, 249],
          [310, F],
        ]);
    }
    s.armDrive = 0.13 * Math.sin(p * Math.PI * 2);
    prop(
      s,
      circle(ball[0], ball[1], 8, "#f2f3ed") +
        xmlPath(`M${ball[0] - 3},${ball[1] - 4}l5,1 1,4-5,2-3,-3Z`, "#60788b", "#60788b", 0.7),
      [
        [ball[0] - 9, ball[1] - 9],
        [ball[0] + 9, ball[1] + 9],
      ],
      true,
    );
    return s;
  }
  const families = {
    squat,
    split,
    lateral_lunge: lateralLunge,
    step_up: stepUp,
    hinge,
    bridge,
    leg_curl: curl,
    nordic,
    press,
    pull,
    core,
    ankle,
    walk,
    carry,
    machine,
    back_extension: backExtension,
    power_lift: powerLift,
    jump,
    throw: medicineThrow,
    run,
    resisted_run: resistedRun,
    preparation,
    mobility_sequence: mobilitySequence,
    cycle,
    breathing,
    football,
  };
  const recordsById = new Map(),
    coaching = scope.BWCoaching,
    oldCoach = {
      forModel: coaching.forModel,
      describe: coaching.describe,
      overlay: coaching.overlay,
    };
  const focusFor = (c) =>
    /curl|nordic/.test(c.family)
      ? ["knee"]
      : /hinge|bridge|extension/.test(c.family)
        ? ["hip"]
        : /press|pull|throw|power_lift/.test(c.family)
          ? ["shoulder", "elbow"]
          : /ankle/.test(c.family)
            ? ["ankle"]
            : ["hip", "knee"];
  coaching.forModel = (id) => {
    const record = recordsById.get(id);
    return record
      ? {
          title: record.title,
          focus: focusFor(record.motion),
          tempo: { verified: false, label: "Tempo poglądowe · wykonuj według instrukcji sesji." },
        }
      : oldCoach.forModel(id);
  };
  coaching.describe = (id, s) => {
    const record = recordsById.get(id);
    if (!record) return oldCoach.describe(id, s);
    return {
      title: record.title,
      cue: s.phase,
      markers: focusFor(record.motion).map((joint) => {
        const arm = scope.BWDrawHuman.armPoints(s, "right", s.torsoAngle ?? 0, s.view === "front");
        return {
          joint,
          side: "right",
          point:
            joint === "hip"
              ? s.hip
              : joint === "shoulder"
                ? arm.shoulder
                : joint === "elbow"
                  ? arm.elbow
                  : s.right[joint],
        };
      }),
    };
  };
  coaching.overlay = (s, id) => {
    if (!recordsById.has(id)) return oldCoach.overlay(s, id);
    return coaching
      .describe(id, s)
      .markers.map(
        (marker) =>
          `<circle cx="${fmt(marker.point[0])}" cy="${fmt(marker.point[1])}" r="6" fill="#87b0c8" fill-opacity=".15" stroke="#4c819f" stroke-width="1"/>`,
      )
      .join("");
  };
  function tempoProfile(c) {
    if (c.isometric || (c.family === "preparation" && /^stretch_/.test(c.variant)))
      return { kind: "hold" };
    const rep = (eccentricFirst, eLabel, cLabel) => ({
      kind: "rep",
      startWith: eccentricFirst ? "eccentric" : "concentric",
      eccentric: eccentricFirst ? [0, 0.44] : [0.56, 1],
      concentric: eccentricFirst ? [0.56, 1] : [0, 0.44],
      bottom: eccentricFirst ? 0.5 : 0,
      top: eccentricFirst ? 0 : 0.5,
      eccentricLabel: eLabel,
      concentricLabel: cLabel,
    });
    if (c.family === "squat") return rep(c.equipment !== "flywheel", "Zejście", "Wstawanie");
    if (c.family === "step_up") return rep(false, "Kontrolowane zejście", "Wejście na podest");
    if (c.family === "split" && c.variant === "reverse_lunge")
      return {
        kind: "rep",
        eccentric: [0.2, 0.5],
        concentric: [0.5, 0.8],
        bottom: 0.5,
        top: 0.8,
        setup: [0, 0.2],
        finish: [0.8, 0.999],
        eccentricLabel: "Zejście",
        concentricLabel: "Wstawanie",
      };
    if (c.family === "split" || c.family === "lateral_lunge")
      return rep(true, "Zejście", "Wstawanie");
    if (c.family === "hinge")
      return rep(
        !["barbell_deadlift", "trap_bar_deadlift"].includes(c.variant),
        "Opuszczanie ciężaru",
        "Podnoszenie ciężaru",
      );
    if (c.family === "press" && c.variant === "push_press")
      return {
        kind: "rep",
        startWith: "concentric",
        eccentric: [0.65, 1],
        concentric: [0, 0.48],
        bottom: 0,
        top: 0.55,
        eccentricLabel: "Opuszczanie sztangi",
        concentricLabel: "Wybicie i wyciskanie",
      };
    if (c.family === "press")
      return rep(
        ["push_up", "pike_push_up", "incline_push_up"].includes(c.variant),
        "Opuszczanie",
        "Wyciskanie / odepchnięcie",
      );
    if (c.family === "pull")
      return rep(
        false,
        "Kontrolowany powrót",
        c.variant === "pull_up" ? "Podciągnięcie" : "Przyciągnięcie",
      );
    if (c.family === "bridge") return rep(false, "Opuszczanie bioder", "Uniesienie bioder");
    if (c.family === "leg_curl") return rep(false, "Prostowanie kolan", "Ugięcie kolan");
    if (c.family === "nordic" && c.variant === "eccentric_nordic_hamstring")
      return {
        kind: "eccentric-only",
        eccentric: [0, 0.6],
        bottom: 0.6,
        eccentricLabel: "Kontrolowane opadanie",
      };
    if (c.family === "nordic")
      return rep(
        true,
        "Kontrolowane opadanie",
        c.variant === "assisted_nordic_hamstring" ? "Powrót z pomocą" : "Powrót",
      );
    if (c.family === "ankle") return rep(false, "Opuszczanie", "Uniesienie");
    if (c.family === "machine")
      return rep(
        false,
        "Kontrolowane ugięcie",
        c.variant === "leg_extension" ? "Prostowanie kolan" : "Wypchnięcie",
      );
    if (c.family === "back_extension")
      return rep(true, "Pochylenie z bioder", "Powrót do linii ciała");
    if (c.family === "preparation" && c.variant === "squat")
      return rep(true, "Zejście", "Wstawanie");
    if (c.family === "preparation" && c.variant === "bridge")
      return rep(false, "Opuszczanie bioder", "Uniesienie bioder");
    return null;
  }
  function withVariant(id, variant) {
    const base = A.models[id];
    if (!base || variant !== "box_touch" || !base.supportsBoxTouch) return base;
    return {
      ...base,
      variant,
      sample(p) {
        const s = base.sample(p);
        if (s.spatial) return scope.BWSpatial.addBox(s);
        prop(s, rect(85, 203, 56, 61, "#fff"), [
          [83, 201],
          [143, F],
        ]);
        s.extras = s.props.back;
        s.framingPoints = s.props.points;
        return s;
      },
    };
  }
  function register(records) {
    for (const record of records) {
      if (!record.motion) continue;
      recordsById.set(record.id, record);
      const c = record.motion,
        fn = families[c.family];
      if (!fn) throw new Error("No instructional motion family: " + c.family);
      A.register(record.id, {
        id: record.id,
        title: record.title,
        durationMs: c.isometric
          ? 7000
          : c.family === "walk" || c.family === "carry"
            ? 3200
            : c.family === "run" || c.family === "resisted_run"
              ? 1600
              : c.family === "cycle"
                ? 2400
                : c.family === "mobility_sequence"
                  ? 12000
                  : 6000,
        sourceVerified: false,
        motionFamily: c.family,
        tempoProfile: tempoProfile(c),
        supportsBoxTouch: ["bodyweight_squat", "goblet_squat", "heavy_back_squat"].includes(
          record.id,
        ),
        unilateral: !!c.unilateral,
        sample(p) {
          const s = fn(c, mod(p));
          s.p = mod(p);
          s.breath ??=
            c.isometric || /^stretch_/.test(c.variant) ? 0.5 + 0.5 * Math.sin(p * Math.PI * 2) : 0;
          s.motionId = record.id;
          s.motionFamily = c.family;
          s.motionEquipment = c.equipment ?? null;
          s.cue = record.instructions?.[0] ?? "";
          s.extras = s.props?.back ?? s.extras ?? "";
          s.frontExtras = s.props?.front ?? "";
          s.framingPoints = s.props?.points ?? [];
          return s;
        },
      });
    }
    // Preserve the resolved child identity in composite sequences.
    for (const model of Object.values(A.models)) {
      if (model.identityTagged) continue;
      const base = model.sample;
      model.sample = (p) => {
        const s = base(p);
        s.motionId ??= model.id;
        return s;
      };
      model.identityTagged = true;
    }
    scope.BWSpatial?.install(A.models, records);
    for (let pass = 0; pass < 4; pass++)
      for (const model of Object.values(A.models))
        if (model.sequence)
          model.durationMs = model.sequence.reduce((sum, id) => sum + A.models[id].durationMs, 0);
  }
  scope.BWMotionLibrary = {
    register,
    withVariant,
    families,
    helpers: {
      pose,
      leg,
      foot,
      point,
      rep,
      hold,
      hands,
      load,
      bench,
      prop,
      line,
      rect,
      circle,
      barbell,
      dumbbell,
      kettlebell,
      phase,
      rot,
      add,
      v,
    },
    version: 52,
  };
})(typeof window === "object" ? window : globalThis);
