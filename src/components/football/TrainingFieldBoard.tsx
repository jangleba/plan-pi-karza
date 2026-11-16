import { useId, useState } from "react";
import type { TrainingExercise } from "@/lib/loadwise/types";
import {
  FIELD_ACTION_LABELS,
  resolveTrainingField,
  type FieldAction,
  type FieldPoint,
  type FieldRoute,
  type TrainingField,
} from "@/lib/trainingField/model";
import "./training-field.css";

/** Setup and action order only; does not start a timer or mark an exercise done. */
export function TrainingFieldBoard({
  exercise,
  compact = false,
}: {
  exercise: TrainingExercise;
  compact?: boolean;
}) {
  const field = resolveTrainingField(exercise);
  if (!field) return null;
  return (
    <FieldBoard key={`${exercise.id}:${JSON.stringify(field)}`} field={field} compact={compact} />
  );
}

function pathData(route: FieldRoute): string {
  const points = route.points;
  const xy = ([x, y]: FieldPoint) => `${x + 10} ${y}`;
  if (route.curved && points.length === 4)
    return `M ${xy(points[0])} C ${xy(points[1])} ${xy(points[2])} ${xy(points[3])}`;
  if (route.action !== "carry")
    return points.map((p, index) => `${index ? "L" : "M"} ${xy(p)}`).join(" ");
  // A small wave distinguishes dribbling even without colour. Its endpoints
  // and route remain on the authored path; it is not a distance scale.
  let path = `M ${xy(points[0])}`;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1],
      [bx, by] = points[i];
    const length = Math.hypot(bx - ax, by - ay);
    const count = Math.max(1, Math.ceil(length / 8));
    for (let part = 0; part < count; part++) {
      const t0 = part / count,
        t1 = (part + 1) / count;
      const tx = ax + (bx - ax) * t1,
        ty = ay + (by - ay) * t1;
      const midpointX = ax + (bx - ax) * ((t0 + t1) / 2);
      const midpointY = ay + (by - ay) * ((t0 + t1) / 2);
      const sign = part % 2 ? -1 : 1;
      const offset = length ? (1.4 * sign) / length : 0;
      path += ` Q ${midpointX + 10 - (by - ay) * offset} ${midpointY + (bx - ax) * offset} ${tx + 10} ${ty}`;
    }
  }
  return path;
}

function FieldBoard({ field, compact }: { field: TrainingField; compact: boolean }) {
  const [index, setIndex] = useState(0);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const current = field.steps[index];
  const kinds = [...new Set(field.routes.map((route) => route.action))];
  const activeRoutes = new Set(current.routes);
  return (
    <section
      className={`bw-training-field${compact ? " bw-training-field--compact" : ""}`}
      data-training-field={field.id}
      aria-label={field.title}
    >
      <div className="bw-training-field-heading">
        <h4>{field.title}</h4>
        <span>Widok z góry</span>
      </div>
      <p className="bw-training-field-equipment">{field.equipment}</p>
      <svg
        viewBox="0 0 120 100"
        role="img"
        aria-labelledby={`${uid}-title ${uid}-description`}
        className="bw-training-field-pitch"
      >
        <title id={`${uid}-title`}>
          {field.title} · krok {index + 1}: {current.title}
        </title>
        <desc id={`${uid}-description`}>
          {current.text} {field.measurements.join(". ")}. Trójkąty oznaczają znaczniki, kółko „Ty”
          pozycję zawodnika. {kinds.map((kind) => FIELD_ACTION_LABELS[kind]).join("; ")}.
        </desc>
        <defs>
          {kinds.map((kind) => (
            <marker
              key={kind}
              id={`${uid}-${kind}`}
              viewBox="0 0 6 6"
              markerWidth="4"
              markerHeight="4"
              refX="5"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0 0 L6 3 L0 6 Z" className={`bw-field-ink bw-field-ink--${kind}`} />
            </marker>
          ))}
        </defs>
        <g className="bw-training-field-lines" aria-hidden="true">
          <rect x="8" y="6" width="104" height="88" rx="3" />
          <path d="M8 50 H112 M41 6 V17 H79 V6 M41 94 V83 H79 V94" />
          <circle cx="60" cy="50" r="10" />
        </g>
        {field.wall && (
          <g className="bw-training-field-wall">
            <path d="M30 13 H90" />
            <text x="60" y="9" textAnchor="middle">
              Ściana
            </text>
          </g>
        )}
        {field.goal && <path className="bw-training-field-goal" d="M35 15 V9 H85 V15" />}
        {field.routes.map((route, routeIndex) => (
          <path
            key={route.id}
            className={`bw-training-field-route bw-field-route--${route.action}`}
            data-field-action={route.action}
            data-field-route={route.id}
            data-field-active={activeRoutes.has(route.id) ? "true" : "false"}
            d={pathData(route)}
            markerEnd={route.action === "control" ? undefined : `url(#${uid}-${route.action})`}
          >
            <title>
              {routeIndex + 1}. {route.label}
            </title>
          </path>
        ))}
        {field.markers.map((marker, markerIndex) => {
          const [x, y] = marker.point;
          return (
            <g
              key={markerIndex}
              className="bw-training-field-marker"
              data-field-marker={marker.kind ?? "cone"}
            >
              {marker.kind === "target" ? (
                <circle cx={x + 10} cy={y} r="4.5" />
              ) : (
                <path d={`M${x + 10} ${y - 3} l-2.6 5 h5.2 Z`} />
              )}
              {marker.label && (
                <text x={x + 10} y={y - 6} textAnchor="middle">
                  {marker.label}
                </text>
              )}
            </g>
          );
        })}
        <g className="bw-training-field-player" aria-label="Pozycja zawodnika">
          <circle cx={current.player[0] + 10} cy={current.player[1]} r="3.5" />
          <text x={current.player[0] + 10} y={current.player[1] + 9} textAnchor="middle">
            Ty
          </text>
        </g>
        {current.ball && (
          <g className="bw-training-field-ball" aria-label="Piłka">
            <circle cx={current.ball[0] + 10 + 3} cy={current.ball[1] - 2} r="1.7" />
            <circle cx={current.ball[0] + 10 + 3} cy={current.ball[1] - 2} r="0.6" />
          </g>
        )}
      </svg>
      {field.measurements.length > 0 && (
        <ul className="bw-training-field-measurements" aria-label="Odległości z planu">
          {field.measurements.map((measurement) => (
            <li key={measurement}>{measurement}</li>
          ))}
        </ul>
      )}
      <ul className="bw-training-field-legend" aria-label="Legenda schematu">
        {kinds.map((kind) => (
          <li key={kind}>
            <LegendLine action={kind} />
            <span>{FIELD_ACTION_LABELS[kind]}</span>
          </li>
        ))}
        {field.markers.some((marker) => marker.kind !== "target") && (
          <li>
            <span className="bw-training-field-cone-key" aria-hidden="true">
              △
            </span>
            <span>Znacznik</span>
          </li>
        )}
      </ul>
      <div className="bw-training-field-steps" role="group" aria-label="Kolejność wykonania">
        {field.steps.map((step, stepIndex) => (
          <button
            type="button"
            key={stepIndex}
            aria-label={`Krok ${stepIndex + 1}: ${step.title}`}
            aria-pressed={index === stepIndex}
            onClick={() => setIndex(stepIndex)}
          >
            <span>{stepIndex + 1}</span>
            {step.title}
          </button>
        ))}
      </div>
      <p className="bw-training-field-instruction" role="status" aria-live="polite">
        {current.text}
      </p>
      <details className="bw-training-field-setup">
        <summary>Rozstawienie i odległości</summary>
        <p>{field.setup}</p>
      </details>
      <p className="bw-training-field-note">
        Schemat poglądowy. Odległości odmierz według opisu, nie z rysunku.
      </p>
    </section>
  );
}

function LegendLine({ action }: { action: FieldAction }) {
  return (
    <svg viewBox="0 0 24 8" aria-hidden="true" className="bw-training-field-line-key">
      <path
        d={action === "carry" ? "M1 4 Q4 0 7 4 T13 4 T19 4 L23 4" : "M1 4 H23"}
        className={`bw-field-route--${action}`}
      />
    </svg>
  );
}
