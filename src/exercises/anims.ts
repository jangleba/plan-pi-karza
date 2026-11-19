import { bodyLine, type Pose, type Vec } from "./figure";

/** Rekwizyty rysowane na scenie (y – od podłoża w górę). */
export type Prop =
  | { t: "rect"; x: number; y: number; w: number; h: number }
  | { t: "line"; a: Vec; b: Vec }
  | { t: "dot"; at: Vec; r: number }
  | { t: "plate"; at: "shoulder" | "wristA" }
  | { t: "tie"; from: "wristA" | "ankleA" | "hip"; to: Vec };

export interface Anim {
  /** „cycle” – płynna pętla; „fade” – po ostatniej pozie krótkie zanikanie i start od nowa (ruchy, które nie wracają). */
  loop: "cycle" | "fade";
  /** [poza, czas dojścia do niej w s, ewentualne zatrzymanie w s]. Pierwszy czas = powrót z ostatniej pozy. */
  frames: Array<[Pose, number, number?]>;
  props?: Prop[];
}

const A0: Vec = [0, 6];
const P = (o: Partial<Pose> & Pick<Pose, "hip">): Pose => ({ trunk: 0, ankA: A0, ...o });
const mirror = (p: Pose): Pose => ({ ...p, ankA: p.ankB ?? p.ankA, ankB: p.ankA, toeA: p.toeB, toeB: p.toeA, kneeA: p.kneeB, kneeB: p.kneeA, handA: p.handB, handB: p.handA });

/* --- przysiady i wykroki --- */
const squatTop = P({ hip: [0, 54], trunk: 6, ankB: [-3, 6], handA: [9, 3] });
const squatBot = P({ hip: [-11, 27], trunk: 40, ankB: [-3, 6], handA: [9, 3] });

const stand = (hand: Vec) => P({ hip: [0, 54], trunk: 4, ankB: [-3, 6], handA: hand });
const squatFreeBot = P({ hip: [-11, 27], trunk: 36, ankB: [-3, 6], handA: [26, 2] });

const splitTop = P({ hip: [0, 52], trunk: 3, ankA: [14, 6], ankB: [-18, 13.5], toeB: 75 });
const splitBot = P({ hip: [0, 30], trunk: 3, ankA: [14, 6], ankB: [-18, 13.5], toeB: 75 });

const pistolTop = P({ hip: [0, 54], trunk: 5, ankB: [30, 34], toeB: -20, handA: [24, 0] });
const pistolBot = P({ hip: [-12, 28], trunk: 38, ankB: [38, 22], toeB: -20, handA: [26, 2] });

/* --- biodro --- */
const rdlTop = P({ hip: [0, 54], trunk: 4, ankB: [-2, 7] });
const rdlBot = P({ hip: [-6, 52], trunk: 78, ankB: [-54, 56], toeB: 80 });

const bridgeBot = P({ hip: [-32, 8], trunk: -90, handA: [22, -2], elb: 1 });
const bridgeTop = P({ hip: [-32, 26], trunk: -118, handA: [22, -2], elb: 1 });
const bridgeSlBot = P({ ...bridgeBot, ankB: [14, 24], toeB: -30 });
const bridgeSlTop = P({ ...bridgeTop, ankB: [16, 42], toeB: -30 });

const sliderIn = P({ hip: [-32, 26], trunk: -118, ankA: [-8, 6], handA: [22, -2], elb: 1 });
const sliderOut = P({ hip: [-32, 26], trunk: -118, ankA: [14, 6], handA: [22, -2], elb: 1 });

const nordicUp = P({ hip: [0, 31], trunk: 0, ankA: [-25, 8], toeA: 170, handA: [10, -4] });
const nordicDown = P({ hip: [22, 14], trunk: 80, ankA: [-25, 8], toeA: 170, handA: [12, -14] });

/* --- góra ciała --- */
const plank = (shoulder: Vec): Pose => ({ ...bodyLine([0, 12], shoulder), ankA: [0, 12], toeA: 72, absA: [84, 0] });
const push = (shoulder: Vec) => plank(shoulder);

const benchBot = P({ hip: [0, 30], trunk: -90, ankA: [24, 6], handA: [3, 8] });
const benchTop = P({ hip: [0, 30], trunk: -90, ankA: [24, 6], handA: [2, 28] });

const rowHang = P({ hip: [-6, 50], trunk: 70, ankB: [-3, 6], handA: [0, -27] });
const rowPull = P({ hip: [-6, 50], trunk: 70, ankB: [-3, 6], handA: [-12, -12] });

const invRow = (shoulder: Vec): Pose => ({ ...bodyLine([0, 6], shoulder), ankA: [0, 6], toeA: -35, absA: [90, 40] });

const facePush = P({ hip: [0, 55], trunk: 3, ankB: [-3, 6], handA: [27, -2], elb: 1 });
const facePull = P({ hip: [0, 55], trunk: 3, ankB: [-3, 6], handA: [8, 3], elb: 1 });

/* --- skoki --- */
const crouch = P({ hip: [-8, 38], trunk: 40, handA: [-14, -10] });
const takeoff = P({ hip: [6, 60], trunk: 10, ankA: [0, 12], toeA: 60, handA: [14, 20] });

/* --- bieg --- */
const sprintA = P({ hip: [0, 52], trunk: 14, ankA: [-34, 20], toeA: 75, ankB: [16, 38], toeB: -10, handA: [14, -6], handB: [-14, -20] });
const skipA = P({ hip: [0, 57], trunk: 4, ankA: [14, 36], toeA: -15, ankB: [-4, 12], toeB: 60, handA: [-12, -18], handB: [16, -10] });
const anklA = P({ hip: [0, 55], trunk: 4, ankA: [8, 18], toeA: -20, ankB: [-2, 12], toeB: 60, handA: [-8, -22], handB: [12, -14] });

export const ANIMS = {
  squat: { loop: "cycle", frames: [[squatTop, 0.9], [squatBot, 0.9, 0.15]], props: [{ t: "plate", at: "shoulder" }] },
  "squat-free": { loop: "cycle", frames: [[stand([26, -2]), 0.9], [squatFreeBot, 0.9, 0.15]] },
  split: { loop: "cycle", frames: [[splitTop, 0.9], [splitBot, 0.9, 0.15]] },
  pistol: { loop: "cycle", frames: [[pistolTop, 1.1], [pistolBot, 1.1, 0.2]] },
  rdl: { loop: "cycle", frames: [[rdlTop, 1.1], [rdlBot, 1.1, 0.2]] },
  bridge: { loop: "cycle", frames: [[bridgeBot, 0.8], [bridgeTop, 0.8, 0.4]] },
  "bridge-sl": { loop: "cycle", frames: [[bridgeSlBot, 0.8], [bridgeSlTop, 0.8, 0.4]] },
  "bridge-iso": { loop: "cycle", frames: [[bridgeSlTop, 0.9], [{ ...bridgeSlTop, hip: [-32, 27.5] }, 0.9]] },
  slider: { loop: "cycle", frames: [[sliderIn, 1.2], [sliderOut, 1.5, 0.3]] },
  nordic: { loop: "cycle", frames: [[nordicUp, 1.8], [nordicDown, 2.4, 0.3]], props: [{ t: "rect", x: -12, y: 0, w: 24, h: 3 }] },
  pushup: { loop: "cycle", frames: [[push([84, 30]), 0.9], [push([86, 10]), 0.9, 0.15]] },
  bench: {
    loop: "cycle", frames: [[benchTop, 0.9, 0.2], [benchBot, 0.9, 0.2]],
    props: [{ t: "rect", x: -50, y: 18, w: 64, h: 6 }, { t: "line", a: [-44, 18], b: [-44, 0] }, { t: "line", a: [8, 18], b: [8, 0] }, { t: "plate", at: "wristA" }],
  },
  row: { loop: "cycle", frames: [[rowHang, 0.9], [rowPull, 0.9, 0.15]], props: [{ t: "plate", at: "wristA" }] },
  invrow: {
    loop: "cycle", frames: [[invRow([86, 12]), 0.9], [invRow([88, 34]), 0.9, 0.15]],
    props: [{ t: "dot", at: [90, 40], r: 2.6 }, { t: "line", a: [100, 0], b: [100, 46] }, { t: "line", a: [90, 40], b: [100, 40] }],
  },
  facepull: {
    loop: "cycle", frames: [[facePush, 0.9], [facePull, 0.9, 0.2]],
    props: [{ t: "tie", from: "wristA", to: [62, 90] }, { t: "dot", at: [62, 90], r: 2.6 }],
  },
  boxjump: {
    loop: "fade",
    frames: [
      [crouch, 0.6, 0.2], [takeoff, 0.25], [P({ hip: [28, 76], trunk: 8, ankA: [26, 48], toeA: 30, handA: [14, 4] }), 0.3],
      [P({ hip: [40, 60], trunk: 25, ankA: [46, 34], handA: [20, -2] }), 0.3], [P({ hip: [46, 83], trunk: 0, ankA: [46, 34], handA: [3, -27] }), 0.5, 0.5],
    ],
    props: [{ t: "rect", x: 28, y: 0, w: 32, h: 28 }],
  },
  depthjump: {
    loop: "fade",
    frames: [
      [P({ hip: [-18, 83], ankA: [-18, 34], handA: [3, -27] }), 0.4, 0.4], [P({ hip: [-4, 62], trunk: 8, ankA: [-4, 30], handA: [12, -6] }), 0.35],
      [P({ hip: [4, 32], trunk: 36, ankA: [10, 6], handA: [24, -4] }), 0.3], [P({ hip: [10, 72], trunk: 6, ankA: [10, 24], toeA: 60, handA: [14, 20] }), 0.28, 0.1],
      [P({ hip: [12, 52], trunk: 12, ankA: [12, 6], handA: [12, -10] }), 0.3, 0.3],
    ],
    props: [{ t: "rect", x: -48, y: 0, w: 32, h: 28 }],
  },
  pogo: {
    loop: "cycle",
    frames: [[P({ hip: [0, 57], trunk: 3, ankA: [0, 12], toeA: 60, handA: [10, -8] }), 0.3], [P({ hip: [0, 73], trunk: 3, ankA: [0, 28], toeA: 60, handA: [10, -8] }), 0.3]],
  },
  hop: {
    loop: "cycle",
    frames: [
      [P({ hip: [-2, 46], trunk: 14, ankB: [-14, 26], toeB: 60, handA: [14, -4], handB: [-12, -18] }), 0.4],
      [P({ hip: [0, 62], trunk: 10, ankA: [0, 24], toeA: 50, ankB: [-10, 30], toeB: 60, handA: [14, -4], handB: [-12, -18] }), 0.4],
    ],
  },
  bound: {
    loop: "cycle",
    frames: [
      [P({ hip: [0, 46], trunk: 20, ankB: [18, 36], toeB: -10, handA: [14, -4], handB: [-12, -18] }), 0.5],
      [P({ hip: [0, 64], trunk: 14, ankA: [-14, 30], toeA: 70, ankB: [20, 44], toeB: -10, handA: [14, -4], handB: [-12, -18] }), 0.5],
    ],
  },
  sqjump: {
    loop: "cycle",
    frames: [
      [P({ hip: [-11, 30], trunk: 38, handA: [-16, -8] }), 0.5, 0.1], [P({ hip: [4, 58], trunk: 8, ankA: [0, 12], toeA: 60, handA: [12, 18] }), 0.25],
      [P({ hip: [4, 76], trunk: 4, ankA: [2, 28], toeA: 70, handA: [8, 26] }), 0.25], [P({ hip: [-8, 36], trunk: 30, ankA: [0, 6], handA: [8, -10] }), 0.3],
    ],
  },
  calf: {
    loop: "cycle",
    frames: [[P({ hip: [0, 55], trunk: 2, ankB: [-3, 6] }), 0.9, 0.1], [P({ hip: [5, 63], trunk: 2, ankA: [5, 14], toeA: 60, ankB: [2, 14], toeB: 60 }), 0.9, 0.3]],
  },
  kneedrive: {
    loop: "cycle",
    frames: [[P({ hip: [0, 55], trunk: 2, ankA: [2, 6], ankB: [-3, 6] }), 0.8], [P({ hip: [0, 55], trunk: 2, ankA: [22, 28], toeA: -10, ankB: [-3, 6] }), 0.8, 0.3]],
    props: [{ t: "tie", from: "ankleA", to: [-50, 20] }, { t: "dot", at: [-50, 20], r: 2.4 }],
  },
  kneeiso: {
    loop: "cycle",
    frames: [[P({ hip: [0, 55], trunk: 0, ankA: [14, 34], toeA: -15, ankB: [-3, 6], handA: [10, -6] }), 0.5], [P({ hip: [1.5, 55], trunk: 0, ankA: [15, 34], toeA: -15, ankB: [-3, 6], handA: [10, -6] }), 0.5]],
    props: [{ t: "line", a: [28, 0], b: [28, 96] }],
  },
  skip: { loop: "cycle", frames: [[skipA, 0.35], [mirror(skipA), 0.35]] },
  ankling: { loop: "cycle", frames: [[anklA, 0.22], [mirror(anklA), 0.22]] },
  sprint: { loop: "cycle", frames: [[sprintA, 0.28], [mirror(sprintA), 0.28]] },
  start: {
    loop: "cycle",
    frames: [
      [P({ hip: [-6, 38], trunk: 48, ankA: [-8, 6], ankB: [10, 6], handA: [14, -10], handB: [-12, -18] }), 0.6],
      [P({ hip: [4, 42], trunk: 48, ankA: [-30, 14], toeA: 80, ankB: [14, 32], toeB: -10, handA: [-12, -18], handB: [16, -8] }), 0.45, 0.15],
    ],
    props: [{ t: "tie", from: "hip", to: [-70, 34] }, { t: "dot", at: [-70, 34], r: 2.4 }],
  },
  decel: {
    loop: "fade",
    frames: [
      [sprintA, 0.5, 0.1],
      [P({ hip: [-10, 36], trunk: -8, ankA: [10, 6], ankB: [26, 6], handA: [16, -4], handB: [-14, -8] }), 0.45, 0.6],
    ],
  },
  sideplank: {
    loop: "cycle",
    frames: [
      [{ ...bodyLine([0, 12], [84, 26]), ankA: [0, 12], toeA: 72, absA: [98, 2] }, 1.2],
      [(() => { const b = bodyLine([0, 12], [84, 26]); const hip: Vec = [b.hip[0], b.hip[1] + 5]; return { hip, trunk: (Math.atan2(84 - hip[0], 26 - hip[1]) * 180) / Math.PI, ankA: [0, 12] as Vec, toeA: 72, absA: [98, 2] as Vec }; })(), 1.2],
    ],
  },
  clean: {
    loop: "cycle",
    frames: [
      [P({ hip: [-10, 46], trunk: 42, ankB: [-2, 6], handA: [3, -27], elb: 1 }), 0.8],
      [P({ hip: [0, 56], trunk: 4, ankA: [3, 12], toeA: 60, ankB: [1, 12], toeB: 60, handA: [6, -24], elb: 1 }), 0.3],
      [P({ hip: [-6, 40], trunk: 12, ankB: [-2, 6], handA: [12, 2], elb: 1 }), 0.25, 0.1],
      [P({ hip: [0, 54], trunk: 4, ankB: [-2, 6], handA: [12, 2], elb: 1 }), 0.4, 0.3],
    ],
    props: [{ t: "plate", at: "wristA" }],
  },
  swing: {
    loop: "cycle",
    frames: [
      [P({ hip: [-16, 46], trunk: 58, ankB: [-3, 6], handA: [16, -22] }), 0.55],
      [P({ hip: [0, 55], trunk: 4, ankB: [-3, 6], handA: [28, -2] }), 0.5, 0.1],
    ],
    props: [{ t: "plate", at: "wristA" }],
  },
  stepup: {
    loop: "cycle",
    frames: [
      [P({ hip: [10, 58], trunk: 14, ankA: [24, 32], ankB: [-2, 10], toeB: 40, handA: [12, -14] }), 0.8],
      [P({ hip: [24, 82], trunk: 2, ankA: [24, 32], ankB: [32, 56], toeB: -10, handA: [14, -12] }), 0.8, 0.3],
    ],
    props: [{ t: "rect", x: 8, y: 0, w: 38, h: 26 }],
  },
} satisfies Record<string, Anim>;

export type AnimKey = keyof typeof ANIMS;

/** Pompki w wersjach z podwyższeniem używają tej samej pętli. */
export const POSES_FOR_TEST: Pose[] = Object.values(ANIMS).flatMap((a) => (a as Anim).frames.map((f) => f[0]));
