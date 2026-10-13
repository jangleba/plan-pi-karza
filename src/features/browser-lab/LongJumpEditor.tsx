import { useEffect, useRef, useState, type RefObject } from "react";
import { findReferenceRectangle, type FloorPoint } from "./longJump";
import { LabButton, LabNotice, messageOf } from "./LabUI";

export type FloorTarget = "reference" | "control" | "line" | "heel";
export interface FloorDraft {
  referenceCorners: FloorPoint[];
  referenceWidthCm: number;
  referenceDepthCm: number;
  calibrationFrameIndex: number | null;
  controlPoints: FloorPoint[];
  controlLengthCm: number;
  takeoffLine: FloorPoint[];
  heel: FloorPoint | null;
  lineFrameIndex: number | null;
  heelFrameIndex: number | null;
  referenceConfirmed: boolean;
  stationaryConfirmed: boolean;
}
export const emptyFloor = (): FloorDraft => ({
  referenceCorners: [],
  referenceWidthCm: 20,
  referenceDepthCm: 14,
  calibrationFrameIndex: null,
  controlPoints: [],
  controlLengthCm: 100,
  takeoffLine: [],
  heel: null,
  lineFrameIndex: null,
  heelFrameIndex: null,
  referenceConfirmed: false,
  stationaryConfirmed: false,
});
const labels: Record<FloorTarget, string> = {
  reference: "Wzorzec",
  control: "Kontrola skali",
  line: "Linia odbicia",
  heel: "Pięta",
};
const targetPoints = (value: FloorDraft, target: FloorTarget): FloorPoint[] =>
  target === "reference"
    ? value.referenceCorners
    : target === "control"
      ? value.controlPoints
      : target === "line"
        ? value.takeoffLine
        : value.heel
          ? [value.heel]
          : [];
const limits: Record<FloorTarget, number> = { reference: 4, control: 2, line: 2, heel: 1 };
export function placeFloorPoint(
  value: FloorDraft,
  target: FloorTarget,
  index: number,
  point: FloorPoint,
  frame: number,
): FloorDraft {
  const field =
    target === "reference"
      ? "referenceCorners"
      : target === "control"
        ? "controlPoints"
        : "takeoffLine";
  if (target === "heel") return { ...value, heel: point, heelFrameIndex: frame };
  const differentFrame =
    target === "reference"
      ? value.calibrationFrameIndex !== frame
      : target === "line"
        ? value.lineFrameIndex !== frame
        : false;
  const points = differentFrame ? [] : [...targetPoints(value, target)];
  points[Math.min(index, points.length)] = point;
  return {
    ...value,
    [field]: points,
    ...(target === "reference"
      ? {
          calibrationFrameIndex: frame,
          referenceConfirmed: false,
          ...(differentFrame ? { controlPoints: [] } : {}),
        }
      : {}),
    ...(target === "line" ? { lineFrameIndex: frame } : {}),
  };
}
interface Props {
  value: FloorDraft;
  target: FloorTarget;
  frameIndex: number;
  ready: boolean;
  canvas: RefObject<HTMLCanvasElement | null>;
  onChange: (value: FloorDraft) => void;
  onTarget: (target: FloorTarget) => void;
  move: (frame: number) => void;
}
export function LongJumpEditor({
  value,
  target,
  frameIndex,
  ready,
  canvas,
  onChange,
  onTarget,
  move,
}: Props) {
  const [error, setError] = useState("");
  const tips: Record<FloorTarget, string> = {
    reference:
      "Zaznacz zewnętrzne narożniki: lewy górny → prawy górny → prawy dolny → lewy dolny. Szerokość odpowiada pierwszym dwóm punktom.",
    control:
      "Zaznacz dwa końce osobnego, odmierzonego odcinka obok strefy skoku. Minimum 100 cm, na tym samym podłożu.",
    line: "Przed odbiciem zaznacz dwa punkty tej samej linii startowej, tuż przed palcami. Potem oznacz klatkę poniżej.",
    heel: "Na klatce lądowania zaznacz miejsce kontaktu bliższej pięty z podłożem. Możesz przeciągnąć punkt i powiększyć obraz.",
  };
  return (
    <div className="bl-floor-editor">
      <div className="bl-floor-tabs" aria-label="Punkty skoku w dal">
        {(Object.keys(labels) as FloorTarget[]).map((key) => (
          <button
            type="button"
            key={key}
            aria-pressed={target === key}
            onClick={() => {
              onTarget(key);
              const frame =
                key === "reference" || key === "control"
                  ? value.calibrationFrameIndex
                  : key === "line"
                    ? value.lineFrameIndex
                    : value.heelFrameIndex;
              if (frame !== null) move(frame);
            }}
          >
            {labels[key]}{" "}
            <span>
              {targetPoints(value, key).length}/{limits[key]}
            </span>
          </button>
        ))}
      </div>
      <p className="bl-muted">{tips[target]}</p>
      {target === "reference" && (
        <>
          <div className="bl-floor-dimensions">
            <label className="bl-label">
              Szerokość (cm)
              <input
                type="number"
                inputMode="decimal"
                aria-label="Szerokość wzorca w cm"
                min={10}
                max={1000}
                step="any"
                value={value.referenceWidthCm || ""}
                onChange={(e) =>
                  onChange({
                    ...value,
                    referenceWidthCm: Number(e.target.value),
                    referenceConfirmed: false,
                  })
                }
              />
            </label>
            <label className="bl-label">
              Drugi wymiar (cm)
              <input
                type="number"
                inputMode="decimal"
                aria-label="Drugi wymiar wzorca w cm"
                min={10}
                max={1000}
                step="any"
                value={value.referenceDepthCm || ""}
                onChange={(e) =>
                  onChange({
                    ...value,
                    referenceDepthCm: Number(e.target.value),
                    referenceConfirmed: false,
                  })
                }
              />
            </label>
          </div>
          <LabButton
            className="bl-secondary"
            disabled={!ready}
            onClick={() => {
              try {
                const image = canvas.current;
                const context = image?.getContext("2d");
                if (!image || !context) throw new Error("Poczekaj na klatkę.");
                const points = findReferenceRectangle(
                  context.getImageData(0, 0, image.width, image.height),
                );
                if (!points)
                  throw new Error(
                    "Nie znaleziono wyraźnej czarnej ramki na białym wzorcu. Zaznacz cztery narożniki ręcznie.",
                  );
                onChange({
                  ...value,
                  referenceCorners: points,
                  calibrationFrameIndex: frameIndex,
                  controlPoints: [],
                  referenceConfirmed: false,
                });
                setError("");
              } catch (reason) {
                setError(messageOf(reason));
              }
            }}
          >
            Znajdź wzorzec
          </LabButton>
          <label className="bl-check">
            <input
              type="checkbox"
              checked={value.referenceConfirmed}
              disabled={value.referenceCorners.length !== 4}
              onChange={(e) => onChange({ ...value, referenceConfirmed: e.target.checked })}
            />
            Sprawdziłem narożniki i rzeczywiste wymiary prostokąta.
          </label>
          <details className="bl-details">
            <summary>Wzorzec i ustawienie</summary>
            <p>
              Przycisk proponuje narożniki czarnej ramki na białym tle. Dowolną matę lub większy
              prostokąt z taśmy oznacz ręcznie. Mały wydruk daleko od kamery może być
              niewystarczający — wtedy użyj większego wzorca.
            </p>
            <a
              className="bl-button bl-secondary"
              href="/lab-wzorzec.svg"
              download="BallWise-wzorzec-20x14cm.svg"
            >
              Pobierz wzorzec
            </a>
            <p>
              Wydruk A4 w skali 100%. Zmierz zewnętrzną ramkę: 20 × 14 cm. Wpisz faktycznie
              zmierzone wymiary.
            </p>
          </details>
        </>
      )}
      {target === "control" && (
        <label className="bl-label">
          Odmierzony odcinek (cm)
          <input
            type="number"
            inputMode="decimal"
            aria-label="Długość kontrolna w cm"
            min={100}
            max={1000}
            step="any"
            value={value.controlLengthCm || ""}
            onChange={(e) => onChange({ ...value, controlLengthCm: Number(e.target.value) })}
          />
        </label>
      )}
      <div className="bl-actions">
        <LabButton
          className="bl-link"
          onClick={() => {
            onChange({
              ...value,
              ...(target === "reference"
                ? {
                    referenceCorners: [],
                    referenceConfirmed: false,
                    controlPoints: [],
                    calibrationFrameIndex: null,
                  }
                : target === "control"
                  ? { controlPoints: [] }
                  : target === "line"
                    ? { takeoffLine: [], lineFrameIndex: null }
                    : { heel: null, heelFrameIndex: null }),
            });
          }}
        >
          Wyczyść {labels[target].toLocaleLowerCase("pl-PL")}
        </LabButton>
      </div>
      <label className="bl-check">
        <input
          type="checkbox"
          checked={value.stationaryConfirmed}
          onChange={(e) => onChange({ ...value, stationaryConfirmed: e.target.checked })}
        />
        Telefon nie poruszył się. Wzorzec i wszystkie punkty leżą na jednym płaskim podłożu.
      </label>
      {error && <LabNotice error>{error}</LabNotice>}
    </div>
  );
}

export function FloorOverlay({
  value,
  target,
  frameIndex,
  ready,
  canvas,
  onChange,
}: Omit<Props, "move" | "onTarget">) {
  const [selected, setSelected] = useState(0);
  const dragging = useRef<number | null>(null);
  const loupe = useRef<HTMLCanvasElement>(null);
  const current = targetPoints(value, target);
  const visiblePoints =
    (target === "line" && value.lineFrameIndex !== frameIndex) ||
    (target === "heel" && value.heelFrameIndex !== frameIndex)
      ? []
      : current;
  const active = visiblePoints[Math.min(selected, visiblePoints.length - 1)];
  useEffect(() => {
    const source = canvas.current,
      context = loupe.current?.getContext("2d");
    if (!source || !context || !active || !ready) return;
    context.clearRect(0, 0, 120, 120);
    context.drawImage(
      source,
      active[0] * source.width - 20,
      active[1] * source.height - 20,
      40,
      40,
      0,
      0,
      120,
      120,
    );
    context.strokeStyle = "#4ca5ff";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(60, 40);
    context.lineTo(60, 80);
    context.moveTo(40, 60);
    context.lineTo(80, 60);
    context.stroke();
  }, [active, ready, canvas, frameIndex]);
  const coords = (event: React.PointerEvent<SVGSVGElement>): FloorPoint => {
    const box = event.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
      Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)),
    ];
  };
  const polygon = (points: FloorPoint[]) =>
    points.map(([x, y]) => `${x * 100},${y * 100}`).join(" ");
  return (
    <>
      <svg
        className="bl-floor-overlay"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="application"
        aria-label={`Zaznacz punkty: ${labels[target]}`}
        onPointerDown={(event) => {
          if (!ready) return;
          const p = coords(event),
            box = event.currentTarget.getBoundingClientRect();
          // Complete a new set before interpreting taps as corrections. On a
          // small screen adjacent corners can be closer than a touch target.
          let index = visiblePoints.length;
          if (index >= limits[target]) {
            const nearest = visiblePoints
              .map((q, i) => ({
                i,
                distance: Math.hypot((q[0] - p[0]) * box.width, (q[1] - p[1]) * box.height),
              }))
              .sort((a, b) => a.distance - b.distance)[0];
            index =
              nearest && nearest.distance < 22 ? nearest.i : Math.min(selected, limits[target] - 1);
          }
          dragging.current = index;
          setSelected(index);
          event.currentTarget.setPointerCapture(event.pointerId);
          onChange(placeFloorPoint(value, target, index, p, frameIndex));
        }}
        onPointerMove={(event) => {
          if (dragging.current !== null && ready)
            onChange(placeFloorPoint(value, target, dragging.current, coords(event), frameIndex));
        }}
        onPointerUp={() => {
          dragging.current = null;
        }}
        onPointerCancel={() => {
          dragging.current = null;
        }}
      >
        {value.referenceCorners.length === 4 && (
          <polygon
            points={polygon(value.referenceCorners)}
            fill="#3997ff18"
            stroke="#55aeff"
            strokeWidth="0.3"
          />
        )}
        {value.controlPoints.length === 2 && (
          <polyline
            points={polygon(value.controlPoints)}
            fill="none"
            stroke="#72e1b8"
            strokeWidth="0.3"
          />
        )}
        {value.takeoffLine.length === 2 && (
          <polyline
            points={polygon(value.takeoffLine)}
            fill="none"
            stroke="#ffc645"
            strokeWidth="0.3"
          />
        )}
        {visiblePoints.map(([x, y], i) => (
          <g key={i}>
            <circle
              cx={x * 100}
              cy={y * 100}
              r="1.1"
              fill="#1688ff"
              stroke="white"
              strokeWidth="0.3"
            />
            <text
              x={x * 100 + 1.5}
              y={y * 100 - 1.5}
              fill="white"
              stroke="#061a30"
              strokeWidth="0.15"
              paintOrder="stroke"
              fontSize="3"
            >
              {target === "heel" ? "P" : i + 1}
            </text>
          </g>
        ))}
      </svg>
      {active && ready && (
        <canvas
          className="bl-floor-loupe"
          ref={loupe}
          width={120}
          height={120}
          aria-label="Powiększenie wybranego punktu"
        />
      )}
    </>
  );
}
