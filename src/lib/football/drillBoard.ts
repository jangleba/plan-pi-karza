import { INDIVIDUAL_FOOTBALL_DRILLS } from "../loadwise/individualFootballDrills";

export { FIELD_TARGETS, FIELD_COLORS } from "../reactive-training/fieldSignals";
type BoardAction = "carry" | "pass" | "shoot" | "run" | "touch";
type Point = readonly [number, number];
interface DrillBoard {
  id: string;
  area: string;
  equipment: string;
  markers: readonly Point[];
  path: readonly Point[];
  action: BoardAction;
  reactive: boolean;
}

/** Geometries are illustrative. Exact distances stay in the exercise's setup, never measured from SVG. */
export function drillBoard(id: string | undefined): DrillBoard | null {
  const drill = INDIVIDUAL_FOOTBALL_DRILLS.find((d) => d.id === id);
  if (!drill) return null;
  const base: DrillBoard = {
    id: drill.id,
    area: drill.steps[0],
    equipment: `1 piłka${"wall" in drill && drill.wall ? " · bezpieczna ściana lub odbojnik" : ""}${"goal" in drill && drill.goal ? " · bramka" : ""}`,
    markers: [],
    path: [
      [50, 65],
      [50, 50],
    ],
    action: "touch",
    reactive: false,
  };
  switch (id) {
    case "football_gate_dribble":
      return {
        ...base,
        equipment: "1 piłka · 8 znaczników",
        markers: [
          [15, 45],
          [15, 55],
          [85, 45],
          [85, 55],
          [45, 15],
          [55, 15],
          [45, 85],
          [55, 85],
        ],
        path: [
          [50, 50],
          [20, 50],
          [50, 50],
          [50, 20],
        ],
        action: "carry",
        reactive: true,
      };
    case "football_scan_control":
    case "football_self_feed_first_touch":
      return {
        ...base,
        markers: [
          [20, 35],
          [80, 35],
        ],
        path: [
          [50, 65],
          [50, 50],
          [20, 35],
        ],
        action: "carry",
        reactive: id === "football_scan_control",
      };
    case "football_cone_feints":
      return {
        ...base,
        equipment: "1 piłka · 1 znacznik",
        markers: [[50, 50]],
        path: [
          [50, 85],
          [50, 65],
          [65, 50],
          [65, 20],
        ],
        action: "carry",
      };
    case "football_turn_control":
      return {
        ...base,
        path: [
          [40, 75],
          [40, 25],
          [60, 25],
          [60, 75],
        ],
        action: "carry",
      };
    case "football_speed_dribble":
      return {
        ...base,
        markers: [
          [35, 80],
          [65, 80],
          [35, 20],
          [65, 20],
        ],
        path: [
          [50, 80],
          [50, 20],
        ],
        action: "carry",
      };
    case "football_slalom_time":
      return {
        ...base,
        equipment: "1 piłka · 6 znaczników · stoper",
        markers: Array.from({ length: 6 }, (_, i) => [50, 20 + i * 12] as Point),
        path: [
          [50, 90],
          [35, 80],
          [65, 68],
          [35, 56],
          [65, 44],
          [35, 32],
          [65, 20],
          [50, 10],
        ],
        action: "carry",
      };
    case "football_target_pass":
    case "football_gk_distribution":
      return {
        ...base,
        markers: [
          [35, 20],
          [65, 20],
        ],
        path: [
          [50, 80],
          [50, 20],
        ],
        action: "pass",
      };
    case "football_long_pass_zone":
    case "football_gk_kick_zone":
      return {
        ...base,
        markers: [
          [35, 15],
          [65, 15],
          [35, 35],
          [65, 35],
        ],
        path: [
          [50, 85],
          [50, 25],
        ],
        action: "pass",
      };
    case "football_finishing_corners":
      return {
        ...base,
        markers: [
          [30, 15],
          [70, 15],
        ],
        path: [
          [50, 85],
          [50, 60],
          [30, 15],
        ],
        action: "shoot",
      };
    case "football_wall_first_touch":
    case "football_wall_one_touch":
    case "football_wall_receive_turn":
    case "football_gk_wall_handling":
      return {
        ...base,
        markers: [
          [20, 20],
          [80, 20],
        ],
        path: [
          [50, 75],
          [50, 20],
          [65, 75],
        ],
        action: "pass",
      };
    default:
      return base;
  }
}
export const ACTION_LABELS: Record<BoardAction, string> = {
  carry: "Prowadzenie piłki",
  pass: "Podanie / lot piłki",
  shoot: "Prowadzenie i strzał",
  run: "Bieg bez piłki",
  touch: "Praca z piłką w miejscu",
};
