import { useEffect, useRef, type RefObject } from "react";
import { type AutomaticLongJumpCalibration, type FloorPoint } from "./longJump";

export function AutomaticLongJumpOverlay({
  value,
  frameIndex,
  editable,
  ready,
  canvas,
  onHeel,
}: {
  value: AutomaticLongJumpCalibration;
  frameIndex: number;
  editable: boolean;
  ready: boolean;
  canvas: RefObject<HTMLCanvasElement | null>;
  onHeel: (point: FloorPoint) => void;
}) {
  const loupe = useRef<HTMLCanvasElement>(null);
  const heelVisible = editable || frameIndex === value.heelFrameIndex;
  useEffect(() => {
    const source = canvas.current;
    const context = loupe.current?.getContext("2d");
    if (!source || !context || !heelVisible || !ready || !editable) return;
    context.clearRect(0, 0, 120, 120);
    context.drawImage(
      source,
      value.heel[0] * source.width - 18,
      value.heel[1] * source.height - 18,
      36,
      36,
      0,
      0,
      120,
      120,
    );
    context.strokeStyle = "#4ca5ff";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(60, 38);
    context.lineTo(60, 82);
    context.moveTo(38, 60);
    context.lineTo(82, 60);
    context.stroke();
  }, [canvas, editable, heelVisible, ready, value.heel]);
  const points = (rows: readonly FloorPoint[]) =>
    rows.map(([x, y]) => `${x * 100},${y * 100}`).join(" ");
  const place = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!editable || !ready || !heelVisible) return;
    const box = event.currentTarget.getBoundingClientRect();
    onHeel([
      Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
      Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)),
    ]);
  };
  return (
    <>
      <svg
        className={`bl-floor-overlay bl-auto-overlay${editable ? " is-editable" : ""}`}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-label={editable ? "Popraw punkt pięty" : "Automatyczne oznaczenia skoku"}
        onPointerDown={(event) => {
          if (!editable) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          place(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) place(event);
        }}
        onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
      >
        <polygon
          points={points(value.referenceCorners)}
          fill="none"
          stroke="#55aeff"
          strokeWidth="0.38"
          strokeDasharray="1.2 0.7"
        />
        <polygon
          points={points(value.rangeCorners)}
          fill="none"
          stroke="#f97316"
          strokeWidth="0.38"
          strokeDasharray="1.2 0.7"
        />
        <polyline
          points={points(value.takeoffLine)}
          fill="none"
          stroke="#ffc645"
          strokeWidth="0.58"
        />
        {heelVisible && (
          <g>
            <circle
              cx={value.heel[0] * 100}
              cy={value.heel[1] * 100}
              r="1.45"
              fill="#1688ff"
              stroke="white"
              strokeWidth="0.4"
            />
            <text
              x={value.heel[0] * 100 + 2}
              y={value.heel[1] * 100 - 2}
              fill="white"
              stroke="#061a30"
              strokeWidth="0.18"
              paintOrder="stroke"
              fontSize="3.2"
            >
              pięta
            </text>
          </g>
        )}
      </svg>
      {editable && heelVisible && ready && (
        <canvas
          className="bl-floor-loupe"
          ref={loupe}
          width={120}
          height={120}
          aria-label="Powiększenie punktu pięty"
        />
      )}
    </>
  );
}
