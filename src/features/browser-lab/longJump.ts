import { z } from "zod";

const pointSchema = z.tuple([z.number().finite().min(0).max(1), z.number().finite().min(0).max(1)]);
export type FloorPoint = z.infer<typeof pointSchema>;
const legacyLongJumpSchema = z.object({
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
export const automaticLongJumpSchema = z.object({
  method: z.enum(["ballwise-marker-pose-v2", "ballwise-marker-pose-v3", "ballwise-marker-pose-v4"]),
  referenceCorners: z.tuple([pointSchema, pointSchema, pointSchema, pointSchema]),
  rangeCorners: z.tuple([pointSchema, pointSchema, pointSchema, pointSchema]),
  landingReferenceCorners: z.tuple([pointSchema, pointSchema, pointSchema, pointSchema]),
  landingRangeCorners: z.tuple([pointSchema, pointSchema, pointSchema, pointSchema]),
  referenceWidthCm: z.literal(20),
  referenceDepthCm: z.literal(24),
  baselineCm: z.literal(300),
  imageWidth: z.number().int().min(100).max(4096),
  imageHeight: z.number().int().min(100).max(4096),
  lineFrameIndex: z.number().int().min(1),
  heelFrameIndex: z.number().int().min(2),
  calibrationFrameIndex: z.number().int().min(1),
  takeoffLine: z.tuple([pointSchema, pointSchema]),
  heel: pointSchema,
  poseConfidence: z.number().finite().min(0).max(1),
  markerQuality: z.number().finite().min(0).max(1),
  heelSource: z.enum(["pose", "manual"]),
});
export const longJumpSchema = z.discriminatedUnion("method", [
  legacyLongJumpSchema,
  automaticLongJumpSchema,
]);
export type LongJumpCalibration = z.infer<typeof longJumpSchema>;
export type AutomaticLongJumpCalibration = z.infer<typeof automaticLongJumpSchema>;

export const MAX_LONG_JUMP_UNCERTAINTY_CM = 5;

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
  return projectiveTransform(corners, destination as FloorPoint[]);
}

function projectiveTransform(image: readonly FloorPoint[], destination: readonly FloorPoint[]) {
  if (image.length !== destination.length || image.length < 4)
    throw new Error("Kalibracja podłoża ma za mało punktów.");
  const rows = image.flatMap(([x, y], i) => {
    const [u, v] = destination[i];
    return [
      [x, y, 1, 0, 0, 0, -u * x, -u * y, u],
      [0, 0, 0, x, y, 1, -v * x, -v * y, v],
    ];
  });
  // Four points solve the 8 unknowns directly. Additional calibration points
  // are fitted by least squares so the 3 m marker controls extrapolation.
  const matrix = Array.from({ length: 8 }, (_, row) =>
    Array.from({ length: 9 }, (_, col) =>
      rows.reduce(
        (sum, equation) => sum + equation[row] * (col === 8 ? equation[8] : equation[col]),
        0,
      ),
    ),
  );
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
  const sign = Math.sign(denominator(image[0]));
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

function automaticLineIndices(data: AutomaticLongJumpCalibration): readonly [number, number] {
  for (const edge of [
    [0, 1],
    [2, 3],
  ] as const) {
    const [a, b] = edge.map((index) => data.referenceCorners[index]);
    const [from, to] = data.takeoffLine;
    if (
      (distance(a, from) < 1e-6 && distance(b, to) < 1e-6) ||
      (distance(a, to) < 1e-6 && distance(b, from) < 1e-6)
    )
      return edge;
  }
  throw new Error("Niebieska krawędź wzorca nie wyznacza linii odbicia.");
}

export function projectiveCentre(
  corners: AutomaticLongJumpCalibration["rangeCorners"],
): FloorPoint {
  const [a, b, c, d] = corners;
  const turns = corners.map((p, i) => cross(p, corners[(i + 1) % 4], corners[(i + 2) % 4]));
  if (
    turns.some((turn) => Math.abs(turn) < 1e-7) ||
    !turns.every((turn) => Math.sign(turn) === Math.sign(turns[0]))
  )
    throw new Error("Wzorzec 3 METRY nie ma poprawnych narożników.");
  const ac: FloorPoint = [c[0] - a[0], c[1] - a[1]];
  const bd: FloorPoint = [d[0] - b[0], d[1] - b[1]];
  const denominator = ac[0] * bd[1] - ac[1] * bd[0];
  if (Math.abs(denominator) < 1e-8) throw new Error("Wzorzec 3 METRY jest zbyt płaski w kadrze.");
  const t = ((b[0] - a[0]) * bd[1] - (b[1] - a[1]) * bd[0]) / denominator;
  return [a[0] + t * ac[0], a[1] + t * ac[1]];
}

function automaticFloorTransform(data: AutomaticLongJumpCalibration) {
  const topLine = automaticLineIndices(data)[0] === 0;
  const startWorld: FloorPoint[] = topLine
    ? [
        [0, 0],
        [20, 0],
        [20, -24],
        [0, -24],
      ]
    : [
        [0, -24],
        [20, -24],
        [20, 0],
        [0, 0],
      ];
  // A rectangle's projected centre is the intersection of its diagonals.
  // Retain the v2 arithmetic centroid only for historical measurements.
  const endCentre =
    data.method !== "ballwise-marker-pose-v2"
      ? projectiveCentre(data.rangeCorners)
      : data.rangeCorners.reduce<FloorPoint>(
          (sum, point) => [sum[0] + point[0] / 4, sum[1] + point[1] / 4],
          [0, 0],
        );
  return projectiveTransform(
    [...data.referenceCorners, endCentre],
    [...startWorld, [10, data.baselineCm]],
  );
}

export function longJumpMeasurement(input: unknown) {
  const parsed = longJumpSchema.safeParse(input);
  if (!parsed.success) throw new Error("Brakuje danych potrzebnych do pomiaru skoku w dal.");
  const data = parsed.data;
  for (let i = 0; i < 4; i++) {
    const a = data.referenceCorners[i],
      b = data.referenceCorners[(i + 1) % 4];
    if (Math.hypot((a[0] - b[0]) * data.imageWidth, (a[1] - b[1]) * data.imageHeight) < 24)
      throw new Error(
        data.method === "floor-homography-v1"
          ? "Wzorzec jest zbyt mały w filmie. Zastosuj większy prostokąt na podłożu lub bliższy kadr."
          : "Wzorzec jest zbyt mały w filmie. Wybierz bliższy kadr lub wyższą rozdzielczość. Ramka nadal musi mieć 20 × 24 cm.",
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
  const map =
    data.method !== "floor-homography-v1"
      ? automaticFloorTransform(data)
      : floorTransform(data.referenceCorners, data.referenceWidthCm, data.referenceDepthCm);
  let measuredControlCm: number | undefined;
  let controlErrorCm: number | undefined;
  let cameraShiftPx: number | undefined;
  if (data.method === "floor-homography-v1") {
    measuredControlCm = distance(map(data.controlPoints[0]), map(data.controlPoints[1]));
    controlErrorCm = Math.abs(measuredControlCm - data.controlLengthCm);
    if (controlErrorCm > 2 + 1e-8)
      throw new Error(
        `Kontrola skali różni się o ${controlErrorCm.toFixed(1)} cm. Popraw narożniki, wymiary i punkty kontrolne (dopuszczalne 2 cm).`,
      );
  } else {
    if (
      data.poseConfidence < 0.58 &&
      (data.method !== "ballwise-marker-pose-v4" || data.heelSource !== "manual")
    )
      throw new Error("Automatyczne wykrycie sylwetki jest zbyt niepewne. Nagraj próbę ponownie.");
    if (data.markerQuality < 0.72)
      throw new Error("Wzorzec BallWise jest niewyraźny. Popraw światło i nagraj ponownie.");
    const startShift = data.referenceCorners.map(
      (point, index) => [point, data.landingReferenceCorners[index]] as const,
    );
    const rangeShift = data.rangeCorners.map(
      (point, index) => [point, data.landingRangeCorners[index]] as const,
    );
    const shifts = [...startShift, ...rangeShift].map(([point, other]) =>
      Math.hypot((point[0] - other[0]) * data.imageWidth, (point[1] - other[1]) * data.imageHeight),
    );
    cameraShiftPx =
      data.method !== "ballwise-marker-pose-v2"
        ? Math.max(...shifts)
        : shifts.reduce((sum, shift) => sum + shift, 0) / 8;
    if (cameraShiftPx > 5)
      throw new Error("Telefon poruszył się podczas próby. Ustaw go stabilnie i nagraj ponownie.");
    const longEdges: [FloorPoint, FloorPoint][] = [
      [data.referenceCorners[0], data.referenceCorners[1]],
      [data.referenceCorners[2], data.referenceCorners[3]],
    ];
    const samePoint = (a: FloorPoint, b: FloorPoint) => distance(a, b) < 1e-6;
    if (
      !longEdges.some(
        ([a, b]) =>
          (samePoint(a, data.takeoffLine[0]) && samePoint(b, data.takeoffLine[1])) ||
          (samePoint(a, data.takeoffLine[1]) && samePoint(b, data.takeoffLine[0])),
      )
    )
      throw new Error("Niebieska krawędź wzorca nie wyznacza linii odbicia.");
  }
  const [a, b] = data.takeoffLine.map(map);
  const heel = map(data.heel);
  if (
    data.method !== "floor-homography-v1" &&
    data.method !== "ballwise-marker-pose-v2" &&
    heel[1] <= Math.max(a[1], b[1])
  )
    throw new Error("Pięta musi znajdować się za linią START, w kierunku wzorca 3 METRY.");
  const lineLength = distance(a, b);
  if (
    data.method === "ballwise-marker-pose-v4"
      ? Math.abs(lineLength - 20) > 0.5
      : lineLength < 20 - 1e-6
  )
    throw new Error("Zaznacz dwa oddalone punkty tej samej linii odbicia (co najmniej 20 cm). ");
  const primaryValue = Math.abs(cross(a, b, heel)) / lineLength;
  if (primaryValue < 10 || primaryValue > 500)
    throw new Error("Odległość jest nietypowa. Sprawdź linię, piętę i wymiary wzorca.");
  const uncertaintyCm =
    data.method !== "floor-homography-v1" ? spatialUncertainty(data) : undefined;
  if (uncertaintyCm !== undefined && uncertaintyCm > MAX_LONG_JUMP_UNCERTAINTY_CM)
    throw new Error(
      `Geometria jest zbyt wrażliwa na ustawienie punktów (${uncertaintyCm.toFixed(1)} cm). Ustaw telefon bliżej i wzorzec bardziej centralnie.`,
    );
  return {
    primaryValue,
    primaryUnit: "cm" as const,
    ...(measuredControlCm === undefined ? {} : { measuredControlCm }),
    ...(controlErrorCm === undefined ? {} : { controlErrorCm }),
    ...(cameraShiftPx === undefined ? {} : { cameraShiftPx }),
    ...(uncertaintyCm === undefined ? {} : { uncertaintyCm }),
  };
}

/** A failed nearer heel must never be silently replaced with the farther foot. */
export function closestLongJumpCandidate(candidates: readonly AutomaticLongJumpCalibration[]) {
  if (candidates.length !== 2) throw new Error("Potrzebne są dwa czytelne punkty pięt.");
  let measured;
  try {
    measured = candidates.map((calibration) => ({
      calibration,
      measurement: longJumpMeasurement(calibration),
    }));
  } catch {
    throw new Error("Nie można ocenić obu pięt. Wskaż ręcznie kontakt bliższej pięty z podłożem.");
  }
  return measured.sort((a, b) => a.measurement.primaryValue - b.measurement.primaryValue)[0]
    .calibration;
}

function spatialUncertainty(data: AutomaticLongJumpCalibration) {
  const lineIndices = automaticLineIndices(data);
  const value = (
    corners: AutomaticLongJumpCalibration["referenceCorners"],
    rangeCorners: AutomaticLongJumpCalibration["rangeCorners"],
    heel: FloorPoint,
  ) => {
    // Keep the selected edge attached to its corner indices while perturbing
    // the calibration. Comparing noisy corners with the original line could
    // switch to the opposite edge and invent a 24 cm change in uncertainty.
    const adjusted = {
      ...data,
      referenceCorners: corners,
      rangeCorners,
      takeoffLine: [corners[lineIndices[0]], corners[lineIndices[1]]] as [FloorPoint, FloorPoint],
    };
    const transform = automaticFloorTransform(adjusted);
    const a = transform(corners[lineIndices[0]]);
    const b = transform(corners[lineIndices[1]]);
    const h = transform(heel);
    return Math.abs(cross(a, b, h)) / distance(a, b);
  };
  const sensitivities: number[] = [];
  const cornerPx = 1.5;
  for (let point = 0; point < 4; point++)
    for (let axis = 0; axis < 2; axis++) {
      const delta = cornerPx / (axis === 0 ? data.imageWidth : data.imageHeight);
      const values = [-delta, delta].map((change) => {
        const corners = data.referenceCorners.map(
          (corner) => [...corner] as FloorPoint,
        ) as AutomaticLongJumpCalibration["referenceCorners"];
        corners[point][axis] = Math.max(0, Math.min(1, corners[point][axis] + change));
        return value(corners, data.rangeCorners, data.heel);
      });
      sensitivities.push(Math.abs(values[1] - values[0]) / 2);
    }
  for (let point = 0; point < 4; point++)
    for (let axis = 0; axis < 2; axis++) {
      const delta = cornerPx / (axis === 0 ? data.imageWidth : data.imageHeight);
      const values = [-delta, delta].map((change) => {
        const corners = data.rangeCorners.map((corner) => [
          ...corner,
        ]) as AutomaticLongJumpCalibration["rangeCorners"];
        corners[point][axis] = Math.max(0, Math.min(1, corners[point][axis] + change));
        return value(data.referenceCorners, corners, data.heel);
      });
      sensitivities.push(Math.abs(values[1] - values[0]) / 2);
    }
  const heelPx = data.heelSource === "manual" ? 1.5 : 4;
  for (let axis = 0; axis < 2; axis++) {
    const delta = heelPx / (axis === 0 ? data.imageWidth : data.imageHeight);
    const values = [-delta, delta].map((change) => {
      const heel = [...data.heel] as FloorPoint;
      heel[axis] = Math.max(0, Math.min(1, heel[axis] + change));
      return value(data.referenceCorners, data.rangeCorners, heel);
    });
    sensitivities.push(Math.abs(values[1] - values[0]) / 2);
  }
  // Includes 5 mm placement tolerance for the centre of the 3 m marker.
  const placement = 0.5;
  return Math.sqrt(sensitivities.reduce((sum, n) => sum + n * n, 0) + placement * placement);
}

/** Conservative proposal for a black rectangular frame on a white target.
 * No body/heel detection or metric calibration is inferred from arbitrary cones.
 * The user must review its four corners and enter measured external dimensions. */
type RectangleCorners = AutomaticLongJumpCalibration["referenceCorners"];

function refinedCorner(
  image: Pick<ImageData, "data" | "width" | "height">,
  point: FloorPoint,
  corner: number,
  step: number,
): FloorPoint {
  const { data, width, height } = image,
    cx = Math.round(point[0] * width),
    cy = Math.round(point[1] * height),
    radius = step * 2 + 2;
  const left = Math.max(0, cx - radius),
    top = Math.max(0, cy - radius),
    right = Math.min(width - 1, cx + radius),
    bottom = Math.min(height - 1, cy + radius),
    w = right - left + 1,
    h = bottom - top + 1;
  const dark = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114 <= 85;
  };
  if (!dark(cx, cy)) return point;
  const score = (x: number, y: number) =>
    corner === 0 ? -x - y : corner === 1 ? x - y : corner === 2 ? x + y : y - x;
  const seen = new Uint8Array(w * h),
    queue = [(cy - top) * w + cx - left];
  seen[queue[0]] = 1;
  let best: [number, number] = [cx, cy],
    bestScore = score(cx, cy);
  for (let read = 0; read < queue.length; read++) {
    const value = queue[read],
      x = left + (value % w),
      y = top + Math.floor(value / w),
      s = score(x, y);
    if (s > bestScore) {
      best = [x, y];
      bestScore = s;
    }
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
      [x - 1, y - 1],
      [x + 1, y - 1],
      [x - 1, y + 1],
      [x + 1, y + 1],
    ]) {
      if (nx < left || nx > right || ny < top || ny > bottom) continue;
      const k = (ny - top) * w + nx - left;
      if (!seen[k] && dark(nx, ny)) {
        seen[k] = 1;
        queue.push(k);
      }
    }
  }
  return [(best[0] + 0.5) / width, (best[1] + 0.5) / height];
}

function referenceRectangles(
  image: Pick<ImageData, "data" | "width" | "height">,
  printed = false,
): { score: number; points: RectangleCorners }[] {
  const { data, width, height } = image;
  const step = Math.max(1, Math.ceil(Math.max(width, height) / 1280));
  const w = Math.floor(width / step),
    h = Math.floor(height / step);
  const grey = new Uint8Array(w * h),
    seen = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const offset = (y * step * width + x * step) * 4;
      grey[y * w + x] = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
    }
  if (printed) {
    // Close tiny breaks introduced by downsampling thin printed borders and
    // white lettering. Identity still requires four original colour patches.
    const expanded = new Uint8Array(w * h),
      closed = new Uint8Array(w * h).fill(255);
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        let dark = false;
        for (let dy = -1; dy <= 1 && !dark; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if (grey[(y + dy) * w + x + dx] <= 85) {
              dark = true;
              break;
            }
        expanded[y * w + x] = dark ? 1 : 0;
      }
    for (let y = 2; y < h - 2; y++)
      for (let x = 2; x < w - 2; x++) {
        let dark = true;
        for (let dy = -1; dy <= 1 && dark; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if (!expanded[(y + dy) * w + x + dx]) {
              dark = false;
              break;
            }
        if (dark) closed[y * w + x] = 0;
      }
    grey.set(closed);
  }
  const candidates: { score: number; points: RectangleCorners }[] = [];
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
        x > 0 && y > 0 ? index - w - 1 : -1,
        x + 1 < w && y > 0 ? index - w + 1 : -1,
        x > 0 && y + 1 < h ? index + w - 1 : -1,
        x + 1 < w && y + 1 < h ? index + w + 1 : -1,
      ]) {
        if (next < 0 || seen[next] || grey[next] > 85) continue;
        seen[next] = 1;
        queue[count++] = next;
      }
    }
    const boxArea = (maxX - minX + 1) * (maxY - minY + 1);
    const quadArea =
      Math.abs(
        extremes.reduce((sum, p, i) => {
          const q = extremes[(i + 1) % 4];
          return sum + p[0] * q[1] - q[0] * p[1];
        }, 0),
      ) / 2;
    if (
      minX < 2 ||
      minY < 2 ||
      maxX > w - 3 ||
      maxY > h - 3 ||
      maxX - minX < 24 / step ||
      maxY - minY < 24 / step ||
      boxArea < w * h * 0.0006 ||
      boxArea > w * h * 0.35 ||
      quadArea < 1 ||
      count / quadArea < 0.08 ||
      count / quadArea > 0.8
    )
      continue;
    const coarse = extremes.map(
      ([x, y]) => [(x * step) / width, (y * step) / height] as FloorPoint,
    ) as RectangleCorners;
    // Coarse search only finds candidates. Refine connected border pixels in
    // the original image rather than quantizing 4K to the search grid.
    const points = coarse.map((p, i) => refinedCorner(image, p, i, step)) as RectangleCorners;
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
    ].every(([dx, dy], index) => {
      const x = Math.round(centre[0] + dx * (maxX - minX)),
        y = Math.round(centre[1] + dy * (maxY - minY));
      return grey[y * w + x] >= (index === 0 ? 120 : 175);
    });
    // Printed BallWise sheets contain text. Their identity is checked using all
    // four coloured fiducials below, not assumed empty pixels in the interior.
    if (!printed && !white) continue;
    const score = boxArea;
    candidates.push({ score, points });
  }
  return candidates.sort((a, b) => b.score - a.score);
}

export function findReferenceRectangle(
  image: Pick<ImageData, "data" | "width" | "height">,
): RectangleCorners | null {
  return referenceRectangles(image)[0]?.points ?? null;
}

export interface BallWiseMarkerDetection {
  corners: AutomaticLongJumpCalibration["referenceCorners"];
  quality: number;
}

export interface BallWiseCalibrationMarkers {
  start: BallWiseMarkerDetection;
  range: BallWiseMarkerDetection;
}

/** Detects the BallWise target, not an arbitrary dark rectangle. Four blue
 * fiducials inside the black frame are required before metric automation is allowed. */
/** Samples the physical fiducials through the projective map, at each quarter-turn.
 * A black frame and all four matching patches are required. Text is unrestricted. */
function markerColourQuality(
  image: Pick<ImageData, "data" | "width" | "height">,
  corners: RectangleCorners,
  colour: "blue" | "orange",
) {
  const toImage = projectiveTransform(
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    corners,
  );
  const centres = [
    [0.18, 0.2],
    [0.82, 0.2],
    [0.82, 0.8],
    [0.18, 0.8],
  ];
  const variants = Array.from({ length: 4 }, (_, rotation) =>
    centres.map(([u, v]) => {
      for (let i = 0; i < rotation; i++) [u, v] = [v, 1 - u];
      return [u, v];
    }),
  );
  const score = (u: number, v: number) => {
    let matched = 0,
      total = 0;
    for (let row = -2; row <= 2; row++)
      for (let col = -2; col <= 2; col++) {
        const [x, y] = toImage([u + col * 0.01, v + row * 0.008]);
        const px = Math.round(x * image.width),
          py = Math.round(y * image.height);
        total++;
        if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
        const offset = (py * image.width + px) * 4;
        const r = image.data[offset],
          g = image.data[offset + 1],
          b = image.data[offset + 2];
        if (
          colour === "blue"
            ? b > 100 && b - r > 45 && b > g * 1.08
            : r > 135 && g > 55 && r - b > 65 && r > g * 1.12
        )
          matched++;
      }
    return matched / total;
  };
  return Math.max(
    ...variants.map((centres) => {
      const scores = centres.map(([u, v]) => score(u, v));
      return scores.every((s) => s >= 0.35) ? scores.reduce((sum, s) => sum + s, 0) / 4 : 0;
    }),
  );
}

export function findBallWiseMarker(
  image: Pick<ImageData, "data" | "width" | "height">,
): BallWiseMarkerDetection | null {
  return (
    referenceRectangles(image, true)
      .map(({ points }) => ({
        corners: points,
        quality: markerColourQuality(image, points, "blue"),
      }))
      .filter((marker) => marker.quality > 0)
      .sort((a, b) => b.quality - a.quality)[0] ?? null
  );
}

/** Both distinct, colour-coded printed frames must be present. */
export function findBallWiseCalibrationMarkers(
  image: Pick<ImageData, "data" | "width" | "height">,
): BallWiseCalibrationMarkers | null {
  const candidates = referenceRectangles(image, true);
  const pick = (colour: "blue" | "orange") =>
    candidates
      .map(({ points }) => ({
        corners: points,
        quality: markerColourQuality(image, points, colour),
      }))
      .filter((marker) => marker.quality > 0)
      .sort((a, b) => b.quality - a.quality)[0];
  const start = pick("blue"),
    range = pick("orange");
  return start && range ? { start, range } : null;
}
