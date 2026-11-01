import type { Point } from "./types";

export type DiagramSize = { width: number; height: number };
export type DiagramView = DiagramSize & { x: number; y: number; scale: number };
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** The same scale on both axes: the field and its circles retain their shape. */
export function diagramView(
  points: readonly Point[],
  size: DiagramSize,
  close = false,
): DiagramView {
  const width = Math.max(1, size.width),
    height = Math.max(1, size.height);
  const valid = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const low = Math.min(...valid.map((p) => p.y), 140);
  const high = Math.max(...valid.map((p) => p.y), 0);
  const aspect = width / height;
  const minX = Math.min(...valid.map((p) => p.x), 100),
    maxX = Math.max(...valid.map((p) => p.x), 0);
  const worldHeight = close
    ? Math.max(42, high - low + 22, Math.max(42, maxX - minX + 22) / aspect)
    : Math.max(72, high - low + 26, 112 / aspect);
  const worldWidth = worldHeight * aspect;
  const middle = valid.length ? (low + high) / 2 : 70;
  return {
    width: worldWidth,
    height: worldHeight,
    x: close
      ? Math.max(-6, Math.min(106 - worldWidth, (minX + maxX - worldWidth) / 2))
      : (100 - worldWidth) / 2,
    y:
      worldHeight <= 152
        ? clamp(middle - worldHeight / 2, -6, 146 - worldHeight)
        : 70 - worldHeight / 2,
    scale: width / worldWidth,
  };
}

export function projectDiagram(point: Point, view: DiagramView): Point {
  return { x: (point.x - view.x) * view.scale, y: (point.y - view.y) * view.scale };
}

export function pickDiagram(point: Point, view: DiagramView): Point | null {
  const world = { x: point.x / view.scale + view.x, y: point.y / view.scale + view.y };
  return world.x >= 0 && world.x <= 100 && world.y >= 0 && world.y <= 140 ? world : null;
}

export type DiagramLabel = {
  id: string;
  anchor: Point;
  kind: "player" | "destination";
  priority: number;
  interactive: boolean;
};
export type PlacedDiagramLabel = DiagramLabel & { center: Point; radius: number };

/** Only the badge moves. Its anchor and leader always retain the real position. */
export function placeDiagramLabels(
  items: readonly DiagramLabel[],
  size: DiagramSize,
  ball: Point,
  playerRise = -24,
): Map<string, PlacedDiagramLabel> {
  const placed: PlacedDiagramLabel[] = [];
  const offsets = [
    [0, playerRise],
    [-34, -24],
    [34, -24],
    [0, 26],
    [-34, 26],
    [34, 26],
    [0, -58],
    [-68, -24],
    [68, -24],
    [-68, 26],
    [68, 26],
    [-34, -58],
    [34, -58],
    [0, 60],
    [-68, -58],
    [68, -58],
  ];
  const sorted = [...items].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  for (const item of sorted) {
    const radius = item.interactive || item.kind === "destination" ? 22 : 16;
    const choices = item.kind === "destination" ? [[0, 0], ...offsets] : offsets;
    const candidates = choices.map(([dx, dy]) => ({
      x: clamp(item.anchor.x + dx, radius + 2, Math.max(radius + 2, size.width - radius - 2)),
      y: clamp(item.anchor.y + dy, radius + 2, Math.max(radius + 2, size.height - radius - 2)),
    }));
    const overlap = (p: Point) =>
      placed.reduce(
        (sum, other) =>
          sum +
          Math.max(
            0,
            radius + other.radius + 3 - Math.hypot(p.x - other.center.x, p.y - other.center.y),
          ),
        0,
      ) + Math.max(0, radius + 7 - Math.hypot(p.x - ball.x, p.y - ball.y));
    let center = candidates.find((p) => overlap(p) === 0);
    // A touchline cluster may exhaust the nearby offsets. Search free space
    // only for that crowded badge, instead of letting it cover another choice.
    if (!center) {
      let bestDistance = Infinity;
      for (let y = radius + 2; y <= size.height - radius - 2; y += 8) {
        for (let x = radius + 2; x <= size.width - radius - 2; x += 8) {
          const p = { x, y };
          const distance = Math.hypot(x - item.anchor.x, y - item.anchor.y);
          if (distance < bestDistance && overlap(p) === 0) {
            center = p;
            bestDistance = distance;
          }
        }
      }
    }
    center ??= candidates.reduce((best, p) => (overlap(p) < overlap(best) ? p : best));
    placed.push({ ...item, center, radius });
  }
  return new Map(placed.map((p) => [p.id, p]));
}
