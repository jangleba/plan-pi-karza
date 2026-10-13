import { z } from "zod";

const pointSchema = z.tuple([z.number().finite().min(0).max(1), z.number().finite().min(0).max(1)]);
export type FloorPoint = z.infer<typeof pointSchema>;
export const longJumpSchema = z.object({
  method: z.literal("floor-homography-v1"),
  referenceCorners: z.tuple([pointSchema, pointSchema, pointSchema, pointSchema]),
  referenceWidthCm: z.number().finite().min(10).max(1000),
  referenceDepthCm: z.number().finite().min(10).max(1000),
  imageWidth: z.number().int().min(100).max(4096),
  imageHeight: z.number().int().min(100).max(4096),
  lineFrameIndex: z.number().int().min(1),
  heelFrameIndex: z.number().int().min(2),
  calibrationFrameIndex: z.number().int().min(0),
  controlPoints: z.tuple([pointSchema, pointSchema]),
  controlLengthCm: z.number().finite().min(100).max(1000),
  takeoffLine: z.tuple([pointSchema, pointSchema]),
  heel: pointSchema,
  referenceConfirmed: z.literal(true),
  stationaryConfirmed: z.literal(true),
});
export type LongJumpCalibration = z.infer<typeof longJumpSchema>;

const cross = (a: FloorPoint, b: FloorPoint, c: FloorPoint) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const distance = (a: FloorPoint, b: FloorPoint) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Eight-parameter planar projective transform. Input points are in the displayed,
 * rotation-corrected image. All measured points must belong to that same floor. */
export function floorTransform(
  corners: LongJumpCalibration["referenceCorners"],
  width: number,
  depth: number,
) {
  const turns = corners.map((p, i) => cross(p, corners[(i + 1) % 4], corners[(i + 2) % 4]));
  if (
    turns.some((n) => Math.abs(n) < 1e-5) ||
    !turns.every((n) => Math.sign(n) === Math.sign(turns[0]))
  )
    throw new Error("Narożniki muszą tworzyć wypukły prostokąt w kolejności wokół jego obwodu.");
  const destination = [
    [0, 0],
    [width, 0],
    [width, depth],
    [0, depth],
  ];
  const matrix = corners.flatMap(([x, y], i) => {
    const [u, v] = destination[i];
    return [
      [x, y, 1, 0, 0, 0, -u * x, -u * y, u],
      [0, 0, 0, x, y, 1, -v * x, -v * y, v],
    ];
  });
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++)
      if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col])) pivot = row;
    if (Math.abs(matrix[pivot][col]) < 1e-9)
      throw new Error("Wzorzec jest zbyt płaski w kadrze. Ustaw kamerę wyżej.");
    [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];
    const factor = matrix[col][col];
    matrix[col] = matrix[col].map((n) => n / factor);
    for (let row = 0; row < 8; row++) {
      if (row === col) continue;
      const k = matrix[row][col];
      matrix[row] = matrix[row].map((n, i) => n - k * matrix[col][i]);
    }
  }
  const h = matrix.map((row) => row[8]);
  const denominator = ([x, y]: FloorPoint) => h[6] * x + h[7] * y + 1;
  const sign = Math.sign(denominator(corners[0]));
  return (point: FloorPoint): FloorPoint => {
    const [x, y] = point;
    const d = denominator(point);
    if (!Number.isFinite(d) || Math.abs(d) < 1e-4 || Math.sign(d) !== sign)
      throw new Error("Punkt leży poza wiarygodnym obszarem podłoża. Popraw kadr i kalibrację.");
    const mapped: FloorPoint = [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d];
    if (mapped.some((n) => !Number.isFinite(n) || Math.abs(n) > 5000))
      throw new Error("Nie można przeliczyć tego punktu na podłoże.");
    return mapped;
  };
}

export function longJumpMeasurement(input: unknown) {
  const parsed = longJumpSchema.safeParse(input);
  if (!parsed.success)
    throw new Error("Uzupełnij wzorzec, odcinek kontrolny, linię odbicia i punkt pięty.");
  const data = parsed.data;
  for (let i = 0; i < 4; i++) {
    const a = data.referenceCorners[i],
      b = data.referenceCorners[(i + 1) % 4];
    if (Math.hypot((a[0] - b[0]) * data.imageWidth, (a[1] - b[1]) * data.imageHeight) < 24)
      throw new Error(
        "Wzorzec jest zbyt mały w filmie. Zastosuj większy prostokąt na podłożu lub bliższy kadr.",
      );
  }
  const area =
    Math.abs(
      data.referenceCorners.reduce((sum, p, i) => {
        const q = data.referenceCorners[(i + 1) % 4];
        return sum + p[0] * q[1] - q[0] * p[1];
      }, 0),
    ) / 2;
  if (area < 0.003)
    throw new Error("Wzorzec zajmuje za mało kadru. Powiększ go i nagraj ponownie.");
  const map = floorTransform(data.referenceCorners, data.referenceWidthCm, data.referenceDepthCm);
  const measuredControlCm = distance(map(data.controlPoints[0]), map(data.controlPoints[1]));
  const controlErrorCm = Math.abs(measuredControlCm - data.controlLengthCm);
  if (controlErrorCm > 2 + 1e-8)
    throw new Error(
      `Kontrola skali różni się o ${controlErrorCm.toFixed(1)} cm. Popraw narożniki, wymiary i punkty kontrolne (dopuszczalne 2 cm).`,
    );
  const [a, b] = data.takeoffLine.map(map);
  const heel = map(data.heel);
  const lineLength = distance(a, b);
  if (lineLength < 20)
    throw new Error("Zaznacz dwa oddalone punkty tej samej linii odbicia (co najmniej 20 cm). ");
  const primaryValue = Math.abs(cross(a, b, heel)) / lineLength;
  if (primaryValue < 10 || primaryValue > 500)
    throw new Error("Odległość jest nietypowa. Sprawdź linię, piętę i wymiary wzorca.");
  return { primaryValue, primaryUnit: "cm" as const, measuredControlCm, controlErrorCm };
}

/** Conservative proposal for a black rectangular frame on a white target.
 * No body/heel detection or metric calibration is inferred from arbitrary cones.
 * The user must review its four corners and enter measured external dimensions. */
export function findReferenceRectangle(
  image: Pick<ImageData, "data" | "width" | "height">,
): LongJumpCalibration["referenceCorners"] | null {
  const { data, width, height } = image;
  const step = Math.max(1, Math.ceil(Math.max(width, height) / 640));
  const w = Math.floor(width / step),
    h = Math.floor(height / step);
  const grey = new Uint8Array(w * h),
    seen = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const offset = (y * step * width + x * step) * 4;
      grey[y * w + x] = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
    }
  let best: { score: number; points: LongJumpCalibration["referenceCorners"] } | null = null;
  const queue = new Int32Array(w * h);
  for (let seed = 0; seed < grey.length; seed++) {
    if (seen[seed] || grey[seed] > 85) continue;
    let read = 0,
      count = 1;
    queue[0] = seed;
    seen[seed] = 1;
    let minX = w,
      maxX = 0,
      minY = h,
      maxY = 0;
    const extremes: [number, number][] = [
      [w, h],
      [0, h],
      [0, 0],
      [w, 0],
    ];
    while (read < count) {
      const index = queue[read++],
        x = index % w,
        y = Math.floor(index / w);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      if (x + y < extremes[0][0] + extremes[0][1]) extremes[0] = [x, y];
      if (x - y > extremes[1][0] - extremes[1][1]) extremes[1] = [x, y];
      if (x + y > extremes[2][0] + extremes[2][1]) extremes[2] = [x, y];
      if (y - x > extremes[3][1] - extremes[3][0]) extremes[3] = [x, y];
      for (const next of [
        x > 0 ? index - 1 : -1,
        x + 1 < w ? index + 1 : -1,
        y > 0 ? index - w : -1,
        y + 1 < h ? index + w : -1,
      ]) {
        if (next < 0 || seen[next] || grey[next] > 85) continue;
        seen[next] = 1;
        queue[count++] = next;
      }
    }
    const boxArea = (maxX - minX + 1) * (maxY - minY + 1);
    if (
      minX < 2 ||
      minY < 2 ||
      maxX > w - 3 ||
      maxY > h - 3 ||
      maxX - minX < 24 / step ||
      maxY - minY < 24 / step ||
      boxArea < w * h * 0.003 ||
      boxArea > w * h * 0.35 ||
      count / boxArea < 0.08 ||
      count / boxArea > 0.8
    )
      continue;
    const points = extremes.map(
      ([x, y]) => [(x * step) / width, (y * step) / height] as FloorPoint,
    ) as LongJumpCalibration["referenceCorners"];
    try {
      floorTransform(points, 20, 14);
    } catch {
      continue;
    }
    const centre = extremes.reduce((sum, p) => [sum[0] + p[0] / 4, sum[1] + p[1] / 4], [0, 0]);
    const white = [
      [0, 0],
      [-0.12, 0],
      [0.12, 0],
      [0, -0.12],
      [0, 0.12],
    ].every(([dx, dy]) => {
      const x = Math.round(centre[0] + dx * (maxX - minX)),
        y = Math.round(centre[1] + dy * (maxY - minY));
      return grey[y * w + x] >= 175;
    });
    if (!white) continue;
    const score = boxArea;
    if (!best || score > best.score) best = { score, points };
  }
  return best?.points ?? null;
}
