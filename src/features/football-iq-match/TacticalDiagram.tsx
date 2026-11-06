import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPlayback, samplePlayback } from "./playback";
import {
  diagramView,
  landscapeDiagramView,
  pickDiagram,
  placeDiagramLabels,
  projectDiagram,
} from "./diagramGeometry";
import type { DiagramLabel, DiagramSize } from "./diagramGeometry";
import type { PlaybackFrame } from "./animation";
import type { TacticalPitchProps } from "./TacticalPitch";
import "./diagram.css";
import { applyFootballerPose, FootballerFigure } from "./FootballerFigure";

const EMPTY_DESTINATIONS: NonNullable<TacticalPitchProps["destinations"]> = [];
const FIXED_PITCH_CORNERS = [
  { x: 0, y: 0 },
  { x: 100, y: 140 },
];

export function TacticalDiagram(props: TacticalPitchProps) {
  const {
    scenario,
    actions,
    frameOverride,
    frameSource,
    playing = false,
    interactive,
    mode,
    selectedPlayerId,
    selectablePlayerIds,
    freeMovement = false,
    showGuidance = true,
    destinations = EMPTY_DESTINATIONS,
    cameraActions,
    onPitchSelect,
    onPlayerSelect,
    onDestinationSelect,
    onReadyChange,
    playbackProgress = 0,
    highlights,
    highlightGood,
    figures = false,
    visibleLabelIds,
    cameraClose = false,
    fixedView = false,
    landscapeView = false,
    compactFigures = false,
  } = props;
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<DiagramSize>({ width: 360, height: 280 });
  const arrowId = useId().replace(/:/g, "");
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const anchors = useRef(new Map<string, SVGCircleElement>());
  const leaders = useRef(new Map<string, SVGLineElement>());
  const ball = useRef<HTMLDivElement>(null);
  const figureNodes = useRef(new Map<string, SVGSVGElement>());
  const playback = useMemo(
    () => (frameOverride ? null : createPlayback(scenario, actions)),
    [scenario, actions, frameOverride],
  );
  const frame = useMemo(
    () => frameOverride ?? samplePlayback(playback!, interactive ? 1 : playbackProgress),
    [frameOverride, playback, interactive, playbackProgress],
  );
  const shownDestinations = showGuidance ? destinations : EMPTY_DESTINATIONS;
  const baseView = useMemo(
    () =>
      landscapeView
        ? landscapeDiagramView(size)
        : diagramView(
            fixedView
              ? FIXED_PITCH_CORNERS
              : [
                  ...(cameraClose && cameraActions?.length
                    ? []
                    : scenario.players
                        .filter(
                          (p) => !p.goalkeeper || p.controlled || p.id === frame.ballCarrierId,
                        )
                        .map((p) => frame.positions.get(p.id) ?? p)),
                  frame.ballVisual,
                  ...(cameraActions?.flatMap((a) => [a.from, a.to]) ?? []),
                  ...shownDestinations.map((d) => d.point),
                ],
            figures && !compactFigures ? { ...size, height: Math.max(60, size.height - 48) } : size,
            !fixedView && cameraClose,
          ),
    [
      scenario.players,
      frame,
      cameraActions,
      shownDestinations,
      size,
      figures,
      compactFigures,
      cameraClose,
      fixedView,
      landscapeView,
    ],
  );
  const view =
    figures && !compactFigures
      ? {
          ...baseView,
          y: baseView.y - 48 / baseView.scale,
          height: baseView.height + 48 / baseView.scale,
        }
      : baseView;
  const canSelectPlayer = (id: string) =>
    interactive && (freeMovement || !selectablePlayerIds || selectablePlayerIds.includes(id));
  function layout(live: PlaybackFrame) {
    const items: DiagramLabel[] = scenario.players
      .filter((p) => !visibleLabelIds || visibleLabelIds.includes(p.id))
      .map((player) => ({
        id: `player:${player.id}`,
        anchor: (() => {
          const p = projectDiagram(live.positions.get(player.id) ?? player, view);
          return visibleLabelIds
            ? { ...p, y: p.y - (figures ? (compactFigures ? 25 : 54) : 20) }
            : p;
        })(),
        kind: "player",
        priority: player.id === selectedPlayerId ? 1 : canSelectPlayer(player.id) ? 2 : 3,
        interactive: canSelectPlayer(player.id) && !freeMovement,
      }));
    items.push(
      ...shownDestinations.map((d) => ({
        id: `destination:${d.id}`,
        anchor: projectDiagram(d.point, view),
        kind: "destination" as const,
        priority: 0,
        interactive,
      })),
    );
    if (visibleLabelIds)
      return new Map(
        items
          .filter(
            (item) =>
              item.anchor.x >= 12 &&
              item.anchor.x <= size.width - 12 &&
              item.anchor.y >= 12 &&
              item.anchor.y <= size.height - 12,
          )
          .map((item) => [item.id, { ...item, center: item.anchor, radius: 16 }]),
      );
    return placeDiagramLabels(
      items.filter(
        (item) =>
          item.anchor.x >= 0 &&
          item.anchor.x <= size.width &&
          item.anchor.y >= 0 &&
          item.anchor.y <= size.height,
      ),
      size,
      projectDiagram(live.ballVisual, view),
      figures ? -56 : -24,
    );
  }
  const placed = layout(frame);
  const latest = useRef({ frameSource, frame, layout, view, size });
  latest.current = { frameSource, frame, layout, view, size };
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const resize = () => {
      const bounds = element.getBoundingClientRect();
      const width = element.clientWidth || bounds.width,
        height = element.clientHeight || bounds.height;
      if (width > 0 && height > 0)
        setSize((old) => (old.width === width && old.height === height ? old : { width, height }));
    };
    resize();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(element);
    window.addEventListener("resize", resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);
  useEffect(() => {
    onReadyChange?.(true);
  }, [onReadyChange]);
  useEffect(() => {
    if (!playing || !frameSource) return;
    let handle = 0,
      cancelled = false;
    const tick = () => {
      if (cancelled) return;
      if (!document.hidden) {
        const current = latest.current;
        const live = current.frameSource?.() ?? current.frame;
        const labels = current.layout(live);
        figureNodes.current.forEach((element, id) => {
          const point = live.positions.get(id);
          const motion = live.motions.get(id);
          if (!point || !motion) return;
          const screen = projectDiagram(point, current.view);
          element.style.left = `${screen.x}px`;
          element.style.top = `${screen.y}px`;
          applyFootballerPose(element, motion);
        });
        buttons.current.forEach((element, id) => {
          const label = labels.get(id);
          element.hidden = !label;
          const anchor = anchors.current.get(id),
            leader = leaders.current.get(id);
          if (anchor) anchor.style.visibility = label ? "visible" : "hidden";
          if (leader) leader.style.visibility = label ? "visible" : "hidden";
          if (!label) return;
          element.style.left = `${label.center.x}px`;
          element.style.top = `${label.center.y}px`;
          anchor?.setAttribute("cx", String(label.anchor.x));
          anchor?.setAttribute("cy", String(label.anchor.y));
          leader?.setAttribute("x1", String(label.anchor.x));
          leader?.setAttribute("y1", String(label.anchor.y));
          leader?.setAttribute("x2", String(label.center.x));
          leader?.setAttribute("y2", String(label.center.y));
        });
        const point = projectDiagram(live.ballVisual, current.view);
        if (ball.current) {
          ball.current.style.left = `${point.x}px`;
          ball.current.style.top = `${point.y}px`;
          ball.current.dataset.airborne = String(live.ballInFlight && live.ballHeight > 2);
        }
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(handle);
    };
  }, [playing, frameSource]);
  function selectPoint(clientX: number, clientY: number) {
    if (!interactive || !root.current) return;
    const bounds = root.current.getBoundingClientRect();
    const pixel = {
      x: clientX - bounds.left - root.current.clientLeft,
      y: clientY - bounds.top - root.current.clientTop,
    };
    if (!freeMovement && ["pass", "through", "cross", "hold", "press", "mark"].includes(mode)) {
      const nearest = scenario.players
        .filter((p) => canSelectPlayer(p.id))
        .map((player) => {
          const label = placed.get(`player:${player.id}`);
          return {
            player,
            distance: landscapeView
              ? Math.hypot(
                  pixel.x - projectDiagram(frame.positions.get(player.id) ?? player, view).x,
                  pixel.y - projectDiagram(frame.positions.get(player.id) ?? player, view).y + 10,
                )
              : label
                ? Math.min(
                    Math.hypot(pixel.x - label.center.x, pixel.y - label.center.y),
                    Math.hypot(pixel.x - label.anchor.x, pixel.y - label.anchor.y),
                  )
                : Infinity,
          };
        })
        .sort((a, b) => a.distance - b.distance)[0];
      if (nearest && nearest.distance <= (landscapeView ? 16 : 22)) {
        onPlayerSelect(nearest.player);
        return;
      }
    }
    // Use the same crop/scale as the drawn field, including after rotation.
    const point = pickDiagram(pixel, view, compactFigures);
    if (point) onPitchSelect(point);
  }
  const ballPoint = projectDiagram(frame.ballVisual, view);
  const marker = (id: string, team?: string) => {
    const label = placed.get(id);
    if (!label) return null;
    return (
      <g key={id} className={`iqD-anchor iqD-anchor--${team ?? "choice"}`}>
        <line
          ref={(element) => {
            if (element) leaders.current.set(id, element);
            else leaders.current.delete(id);
          }}
          x1={label.anchor.x}
          y1={label.anchor.y}
          x2={label.center.x}
          y2={label.center.y}
        />
        <circle
          ref={(element) => {
            if (element) anchors.current.set(id, element);
            else anchors.current.delete(id);
          }}
          cx={label.anchor.x}
          cy={label.anchor.y}
          r={team ? 2.5 : 4}
        />
      </g>
    );
  };
  const styleAt = (id: string) => {
    const label = placed.get(id);
    return { left: label?.center.x ?? -100, top: label?.center.y ?? -100 };
  };
  return (
    <div
      ref={root}
      className={`bwiq-pitch-wrap bwiq-pitch-wrap--diagram iqD-board${figures ? " iqD-board--figures" : ""}${showGuidance ? "" : " bwiq-pitch-wrap--independent"}`}
      onClick={(event) => {
        event.stopPropagation();
        selectPoint(event.clientX, event.clientY);
      }}
    >
      <svg
        className="iqD-field"
        viewBox={`0 0 ${size.width} ${size.height}`}
        preserveAspectRatio="xMidYMid meet"
        aria-label="Boisko — widok sytuacji z góry"
      >
        <defs>
          <marker
            id={arrowId}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M0 0L10 5L0 10Z" fill="#d8edfa" />
          </marker>
        </defs>
        <g
          transform={`translate(${-view.x * view.scale} ${-view.y * view.scale}) scale(${view.scale})${view.rotated ? " matrix(0 1 -1 0 140 0)" : ""}`}
        >
          <rect className="iqD-turf" x="0" y="0" width="100" height="140" />
          {[0, 2, 4, 6].map((n) => (
            <rect key={n} className="iqD-stripe" x="0" y={n * 20} width="100" height="20" />
          ))}
          <g className="iqD-lines">
            <rect x="1" y="1" width="98" height="138" />
            <path d="M1 70H99M21 1V23H79V1M37 1V9H63V1M21 139V117H79V139M37 139V131H63V139" />
            <circle cx="50" cy="70" r="9" />
            <path d="M42 -2H58V1H42ZM42 142H58V139H42" />
            <circle cx="50" cy="16" r=".5" />
            <circle cx="50" cy="124" r=".5" />
          </g>
          {showGuidance &&
            actions.map((a) => (
              <path
                key={a.id}
                d={`M${a.from.x} ${a.from.y}L${a.to.x} ${a.to.y}`}
                className="iqD-route"
                strokeDasharray={a.type === "pass" ? "2 2" : undefined}
                markerEnd={`url(#${arrowId})`}
              />
            ))}
          {showGuidance &&
            highlights?.map((p, index) => (
              <circle
                key={index}
                cx={p.x}
                cy={p.y}
                r="6"
                className={highlightGood ? "iqD-hint is-good" : "iqD-hint"}
              />
            ))}
        </g>
        {!visibleLabelIds && scenario.players.map((p) => marker(`player:${p.id}`, p.team))}
        {shownDestinations.map((d) => marker(`destination:${d.id}`))}
      </svg>
      {figures &&
        scenario.players.map((player) => {
          const p = projectDiagram(frame.positions.get(player.id) ?? player, view);
          const motion = frame.motions.get(player.id)!;
          return (
            <svg
              key={player.id}
              data-iq-figure={player.id}
              className={`iqD-figure iqD-figure--${player.team}${player.goalkeeper ? " iqD-figure--keeper" : ""}`}
              viewBox="0 0 40 60"
              style={{ left: p.x, top: p.y }}
              aria-hidden="true"
              ref={(element) => {
                if (element) figureNodes.current.set(player.id, element);
                else figureNodes.current.delete(player.id);
              }}
            >
              <FootballerFigure motion={motion} />
            </svg>
          );
        })}
      {scenario.players
        .filter((p) => !visibleLabelIds || visibleLabelIds.includes(p.id))
        .map((player) => {
          const id = `player:${player.id}`;
          return (
            <button
              key={id}
              type="button"
              hidden={!placed.has(id)}
              data-iq-player={player.id}
              data-has-ball={frame.ballCarrierId === player.id && !frame.ballInFlight}
              className={`iqD-player iqD-player--${player.team}${player.id === selectedPlayerId ? " is-you" : ""}`}
              style={styleAt(id)}
              disabled={!canSelectPlayer(player.id)}
              aria-label={`Zawodnik ${player.number}, ${player.role}${player.controlled ? ", Ty" : ""}${frame.ballCarrierId === player.id && !frame.ballInFlight ? ", z piłką" : ""}`}
              ref={(element) => {
                if (element) buttons.current.set(id, element);
                else buttons.current.delete(id);
              }}
              onClick={(event) => {
                event.stopPropagation();
                if (!interactive) return;
                if (freeMovement) onPitchSelect(frame.positions.get(player.id) ?? player);
                else onPlayerSelect(player);
              }}
            >
              <span>{player.controlled ? "TY" : player.number}</span>
            </button>
          );
        })}
      {shownDestinations.map((d, index) => {
        const id = `destination:${d.id}`;
        return (
          <button
            key={id}
            type="button"
            data-iq-destination={d.id}
            className="iqD-destination"
            style={styleAt(id)}
            disabled={!interactive}
            aria-label={d.label}
            ref={(element) => {
              if (element) buttons.current.set(id, element);
              else buttons.current.delete(id);
            }}
            onClick={(event) => {
              event.stopPropagation();
              if (interactive) onDestinationSelect?.(d.id);
            }}
          >
            {d.shortLabel ?? String.fromCharCode(65 + index)}
          </button>
        );
      })}
      <div
        ref={ball}
        className="iqD-ball"
        style={{ left: ballPoint.x, top: ballPoint.y }}
        data-airborne={frame.ballInFlight && frame.ballHeight > 2}
        aria-label="Piłka"
      >
        <span />
      </div>
    </div>
  );
}
