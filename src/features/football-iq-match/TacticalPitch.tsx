import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { createPlayback, samplePlayback } from "./playback";
import type { TeachingMarker } from "./teaching";
import type { PitchScene } from "./pitchScene";
import type {
  ActionMode,
  MatchPlayer,
  PlannedAction,
  Point,
  Scenario,
} from "./types";
import type { PlaybackFrame } from "./animation";
import { TacticalDiagram } from "./TacticalDiagram";
import { placeDiagramLabels } from "./diagramGeometry";
import type { DiagramLabel } from "./diagramGeometry";
const NO_ACTIONS: PlannedAction[] = [];

export type TacticalPitchProps = {
  diagram?: boolean;
  figures?: boolean;
  visibleLabelIds?: string[];
  cameraClose?: boolean;
  /** Keep the pitch reference frame unchanged while the action unfolds. */
  fixedView?: boolean;
  /** Fit the entire pitch to the viewport; use a wide orientation on short screens. */
  landscapeView?: boolean;
  compactFigures?: boolean;
  portraitThreshold?: number;
  /** 2.5D: perspective camera behind the attack that follows the ball. */
  broadcastView?: boolean;
  scenario: Scenario;
  actions: PlannedAction[];
  selectedPlayerId: string;
  mode: ActionMode;
  interactive: boolean;
  playbackProgress?: number;
  playing?: boolean;
  focusOnActions?: boolean;
  cameraActions?: PlannedAction[];
  activeActionId?: string;
  onPlayerSelect: (player: MatchPlayer) => void;
  onPitchSelect: (point: Point) => void;
  onReadyChange?: (ready: boolean) => void;
  highlights?: Point[];
  highlightGood?: boolean;
  teachingMarkers?: TeachingMarker[];
  activeTeachingId?: string;
  onTeachingSelect?: (id: string) => void;
  frameOverride?: PlaybackFrame;
  frameSource?: () => PlaybackFrame;
  selectablePlayerIds?: string[];
  destinations?: {
    id: string;
    point: Point;
    label: string;
    shortLabel?: string;
  }[];
  onDestinationSelect?: (id: string) => void;
  showActionOrders?: boolean;
  showGuidance?: boolean;
  freeMovement?: boolean;
};
export function TacticalPitch(props: TacticalPitchProps) {
  return props.diagram ? (
    <TacticalDiagram {...props} />
  ) : (
    <TacticalScenePitch {...props} />
  );
}
function TacticalScenePitch({
  diagram = false,
  scenario,
  actions,
  selectedPlayerId,
  mode,
  interactive,
  playbackProgress = 0,
  playing = false,
  focusOnActions = false,
  cameraActions,
  activeActionId,
  onPlayerSelect,
  onPitchSelect,
  onReadyChange,
  highlights,
  highlightGood,
  teachingMarkers = [],
  activeTeachingId,
  onTeachingSelect,
  frameOverride,
  frameSource,
  selectablePlayerIds,
  destinations = [],
  onDestinationSelect,
  showActionOrders = true,
  showGuidance = true,
  freeMovement = false,
  visibleLabelIds,
  cameraClose = false,
  fixedView = false,
  landscapeView: adaptiveView = false,
  portraitThreshold = 1 / 1.8,
  broadcastView = false,
}: TacticalPitchProps) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<PitchScene | null>(null);
  const ballLabel = useRef<HTMLDivElement>(null);
  const teachingLabels = useRef(new Map<string, HTMLButtonElement>());
  const highlightLabels = useRef(new Map<number, HTMLDivElement>());
  const playerLabels = useRef(new Map<string, HTMLButtonElement>());
  const routeLabels = useRef(new Map<string, HTMLSpanElement>());
  const destinationLabels = useRef(new Map<string, HTMLButtonElement>());
  const labelLeaders = useRef(new Map<string, SVGLineElement>());
  const destinationDots = useRef(new Map<string, SVGCircleElement>());
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  const [widePitch, setWidePitch] = useState(false);
  const landscapeView = adaptiveView && widePitch;
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const update = () =>
      setWidePitch(
        window.innerWidth / Math.max(1, window.innerHeight) > portraitThreshold,
      );
    const observer = new ResizeObserver(update);
    observer.observe(el);
    update();
    return () => observer.disconnect();
  }, [portraitThreshold]);
  const hasRecordedFrame = frameOverride != null;
  const playback = useMemo(
    () => (hasRecordedFrame ? null : createPlayback(scenario, actions)),
    [scenario, actions, hasRecordedFrame],
  );
  const frame = useMemo(
    () =>
      frameOverride ??
      samplePlayback(playback!, interactive ? 1 : playbackProgress),
    [frameOverride, playback, interactive, playbackProgress],
  );
  const latest = useRef({
    frame,
    frameSource,
    actions,
    selectedPlayerId,
    interactive,
    playing,
    focusOnActions,
    onReadyChange,
    highlights,
    teachingMarkers,
    cameraActions,
    activeActionId,
    activeTeachingId,
    destinations,
    showGuidance,
    selectablePlayerIds,
    freeMovement,
    visibleLabelIds,
    cameraClose,
    fixedView,
    landscapeView,
    adaptiveView,
    broadcastView,
  });
  latest.current = {
    frame,
    frameSource,
    actions,
    selectedPlayerId,
    interactive,
    playing,
    focusOnActions,
    onReadyChange,
    highlights,
    teachingMarkers,
    cameraActions,
    activeActionId,
    activeTeachingId,
    destinations,
    showGuidance,
    selectablePlayerIds,
    freeMovement,
    visibleLabelIds,
    cameraClose,
    fixedView,
    landscapeView,
    adaptiveView,
    broadcastView,
  };

  function sync() {
    const api = scene.current;
    const state = latest.current;
    const liveFrame = state.frameSource?.() ?? state.frame;
    if (!api) return;
    // Read geometry before changing label styles, avoiding a forced layout per frame.
    const hostWidth = host.current?.clientWidth || 360;
    const hostHeight = host.current?.clientHeight || 280;
    api.update(
      liveFrame,
      state.showGuidance ? state.actions : NO_ACTIONS,
      state.interactive && state.showGuidance ? state.selectedPlayerId : null,
      state.playing,
      !state.fixedView && state.focusOnActions,
      state.cameraActions,
      state.activeActionId,
      state.showGuidance
        ? state.teachingMarkers.find((m) => m.id === state.activeTeachingId)
            ?.point
        : undefined,
      state.showGuidance,
      !state.fixedView && state.cameraClose,
      state.fixedView,
      state.landscapeView,
      state.adaptiveView,
      state.broadcastView,
    );
    const items: DiagramLabel[] = [];
    playerLabels.current.forEach((_element, id) => {
      const point = liveFrame.positions.get(id);
      if (!point) return;
      items.push({
        id: `player:${id}`,
        anchor: api.project(
          point,
          state.adaptiveView
            ? (api.figureHeight?.() ?? 10.2) + 1.5
            : 7.5 * (state.fixedView ? 2 : 1),
        ),
        kind: "player",
        priority: id === state.selectedPlayerId ? 1 : 3,
        interactive:
          state.interactive &&
          !state.freeMovement &&
          (!state.selectablePlayerIds ||
            state.selectablePlayerIds.includes(id)),
      });
    });
    if (state.showGuidance)
      items.push(
        ...state.destinations.map((d) => ({
          id: `destination:${d.id}`,
          anchor: api.project(d.point, 0.1),
          kind: "destination" as const,
          priority: 0,
          interactive: state.interactive,
        })),
      );
    const labels = placeDiagramLabels(
      items,
      { width: hostWidth, height: hostHeight },
      { x: -100, y: -100 },
      0,
    );
    const syncLabel = (element: HTMLElement, id: string) => {
      const label = labels.get(id);
      if (!label) return;
      const point = state.visibleLabelIds ? label.anchor : label.center;
      element.style.left = `${point.x}px`;
      element.style.top = `${point.y}px`;
      element.hidden =
        point.x < 12 ||
        point.x > hostWidth - 12 ||
        point.y < 12 ||
        point.y > hostHeight - 12;
      const line = labelLeaders.current.get(id);
      line?.setAttribute("x1", String(label.anchor.x));
      line?.setAttribute("y1", String(label.anchor.y));
      line?.setAttribute("x2", String(label.center.x));
      line?.setAttribute("y2", String(label.center.y));
      const dot = destinationDots.current.get(id);
      dot?.setAttribute("cx", String(label.anchor.x));
      dot?.setAttribute("cy", String(label.anchor.y));
    };
    playerLabels.current.forEach((element, id) =>
      syncLabel(element, `player:${id}`),
    );
    destinationLabels.current.forEach((element, id) =>
      syncLabel(element, `destination:${id}`),
    );
    if (ballLabel.current) {
      const p = api.project(liveFrame.ballVisual, liveFrame.ballHeight);
      ballLabel.current.style.left = `${p.x}px`;
      ballLabel.current.style.top = `${p.y}px`;
    }
    state.teachingMarkers.forEach((marker) => {
      const element = teachingLabels.current.get(marker.id);
      if (!element) return;
      const p = api.project(marker.point, 0.2);
      const offset = marker.point.x > 75 ? -24 : 24;
      element.style.left = `${p.x + offset}px`;
      element.style.top = `${p.y + 18}px`;
      element.style.setProperty("--cue-offset-x", `${offset}px`);
    });
    state.highlights?.forEach((point, i) => {
      const element = highlightLabels.current.get(i);
      if (element) {
        const p = api.project(point, 0.2);
        element.style.left = p.x + "px";
        element.style.top = p.y + "px";
      }
    });
    state.actions.forEach((action) => {
      const element = routeLabels.current.get(action.id);
      if (!element) return;
      const p = api.project(action.from, 0.2);
      element.style.left = `${p.x + 10}px`;
      element.style.top = `${p.y - 5}px`;
    });
  }
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    if (diagram) {
      setStatus("fallback");
      latest.current.onReadyChange?.(true);
      return;
    }
    let cancelled = false;
    let failed = false;
    const controller = new AbortController();
    let api: PitchScene | null = null;
    let observer: ResizeObserver | null = null;
    setStatus("loading");
    latest.current.onReadyChange?.(true);
    const fail = () => {
      if (cancelled) return;
      failed = true;
      controller.abort();
      scene.current = null;
      api?.dispose();
      api = null;
      setStatus("fallback");
      latest.current.onReadyChange?.(true);
    };
    void import("./pitchScene")
      .then(async ({ createPitchScene }) => {
        if (cancelled) return;
        api = await createPitchScene(
          element,
          scenario.players,
          fail,
          controller.signal,
        );
        if (cancelled || failed) {
          api.dispose();
          return;
        }
        scene.current = api;
        observer = new ResizeObserver(() => {
          api?.resize();
          sync();
        });
        observer.observe(element);
        sync();
        setStatus("ready");
        latest.current.onReadyChange?.(true);
      })
      .catch(fail);
    return () => {
      cancelled = true;
      controller.abort();
      observer?.disconnect();
      scene.current = null;
      api?.dispose();
    };
  }, [scenario.players, attempt, diagram]);
  useEffect(() => {
    if (!(playing && frameSource)) sync();
  }, [
    frame,
    frameSource,
    actions,
    selectedPlayerId,
    interactive,
    playing,
    focusOnActions,
    highlights,
    mode,
    teachingMarkers,
    status,
    cameraActions,
    activeActionId,
    activeTeachingId,
    destinations,
    showGuidance,
    visibleLabelIds,
    cameraClose,
    fixedView,
    landscapeView,
    adaptiveView,
    broadcastView,
  ]);
  useEffect(() => {
    if (!playing || !frameSource) return;
    let handle = 0,
      cancelled = false;
    const tick = () => {
      if (cancelled) return;
      if (!document.hidden) sync();
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(handle);
    };
  }, [playing, frameSource, status]);
  const selectPoint = (
    event: Pick<MouseEvent<HTMLDivElement>, "clientX" | "clientY">,
  ) => {
    if (!interactive || status !== "ready") return;
    const api = scene.current;
    if (!host.current) return;
    const bounds = host.current.getBoundingClientRect();
    const x = event.clientX - bounds.left,
      y = event.clientY - bounds.top;
    const nearest = scenario.players
      .filter(
        (player) =>
          !selectablePlayerIds || selectablePlayerIds.includes(player.id),
      )
      .map((player) => {
        const point = frame.positions.get(player.id)!;
        const p = api
          ? api.project(point, 7.5)
          : {
              x: (point.x / 100) * bounds.width,
              y: (point.y / 140) * bounds.height,
            };
        return { player, distance: Math.hypot(p.x - x, p.y - y) };
      })
      .sort((a, b) => a.distance - b.distance)[0];
    if (
      !freeMovement &&
      ["pass", "through", "cross", "hold", "press", "mark"].includes(mode) &&
      nearest &&
      nearest.distance <= (adaptiveView ? 16 : 23) &&
      (!selectablePlayerIds || selectablePlayerIds.includes(nearest.player.id))
    ) {
      onPlayerSelect(nearest.player);
      return;
    }
    const point = api
      ? api.pick(event.clientX, event.clientY)
      : bounds.width && bounds.height
        ? {
            x: Math.max(0, Math.min(100, (x / bounds.width) * 100)),
            y: Math.max(0, Math.min(140, (y / bounds.height) * 140)),
          }
        : null;
    if (point) onPitchSelect(point);
  };
  return (
    <div
      className={`bwiq-pitch-wrap ${diagram ? "bwiq-pitch-wrap--diagram" : "bwiq-pitch-wrap--3d"}${showGuidance ? "" : " bwiq-pitch-wrap--independent"}`}
      data-iq-renderer={status}
      data-iq-layout={landscapeView ? "wide" : "tall"}
      onClick={selectPoint}
    >
      <div className="bwiq-pitch-canvas" ref={host} />
      {/* The TV view never shows flat figures while the 3D players load. */}
      {status === "loading" && broadcastView && (
        <div className="bwiq-pitch-loading" role="status">
          Ładuję boisko…
        </div>
      )}
      {status !== "ready" && !(status === "loading" && broadcastView) && (
        <TacticalDiagram
          {...{
            scenario,
            actions,
            selectedPlayerId,
            mode,
            interactive,
            playbackProgress,
            playing,
            focusOnActions,
            cameraActions,
            activeActionId,
            onPlayerSelect,
            onPitchSelect,
            highlights,
            highlightGood,
            teachingMarkers,
            activeTeachingId,
            onTeachingSelect,
            frameOverride,
            frameSource,
            selectablePlayerIds,
            destinations,
            onDestinationSelect,
            showActionOrders,
            showGuidance,
            freeMovement,
            visibleLabelIds,
            cameraClose,
            fixedView,
            landscapeView,
            compactFigures: adaptiveView,
          }}
          figures
        />
      )}
      {status === "fallback" && (
        <button
          type="button"
          className="iqJ-retry-3d"
          onClick={(event) => {
            event.stopPropagation();
            setAttempt((n) => n + 1);
          }}
        >
          Animacja 2D · Włącz 3D
        </button>
      )}
      {status === "ready" && (
        <>
          <div className="bwiq-pitch-legend">
            <span>{scenario.defensive ? "↓ Twoja bramka" : "↑ Atakujesz"}</span>
            <span>
              <i /> Piłka
            </span>
          </div>
          {showGuidance &&
            highlights?.map((point, i) => {
              const p = scene.current?.project(point, 0.2);
              return p || status !== "ready" ? (
                <div
                  key={i}
                  className={
                    highlightGood
                      ? "bwiq-highlight bwiq-highlight--good"
                      : "bwiq-highlight"
                  }
                  ref={(element) => {
                    if (element) highlightLabels.current.set(i, element);
                    else highlightLabels.current.delete(i);
                  }}
                  style={
                    status !== "ready"
                      ? {
                          left: `${point.x}%`,
                          top: `${(point.y / 140) * 100}%`,
                        }
                      : { left: p!.x, top: p!.y }
                  }
                  aria-label={
                    highlightGood
                      ? "Miejsce stworzenia przewagi"
                      : "Miejsce do poprawy"
                  }
                />
              ) : null;
            })}
          {showGuidance &&
            teachingMarkers.map((marker) => (
              <button
                key={marker.id}
                style={
                  status !== "ready"
                    ? {
                        left: `${marker.point.x}%`,
                        top: `${(marker.point.y / 140) * 100}%`,
                      }
                    : undefined
                }
                ref={(element) => {
                  if (element) teachingLabels.current.set(marker.id, element);
                  else teachingLabels.current.delete(marker.id);
                }}
                className={`bwiq-teaching-marker${marker.id === activeTeachingId ? " is-active" : ""}`}
                aria-label={`Wskazówka ${marker.letter}: ${marker.label}`}
                aria-pressed={marker.id === activeTeachingId}
                onClick={(event) => {
                  event.stopPropagation();
                  onTeachingSelect?.(marker.id);
                }}
              >
                <span>{marker.letter}</span>
                <em>{marker.label}</em>
              </button>
            ))}
          {!visibleLabelIds && (
            <svg className="iq3-label-guides" aria-hidden="true">
              {scenario.players.map((player) => (
                <line
                  key={player.id}
                  ref={(el) => {
                    const id = `player:${player.id}`;
                    if (el) labelLeaders.current.set(id, el);
                    else labelLeaders.current.delete(id);
                  }}
                />
              ))}
              {showGuidance &&
                destinations.map((d) => (
                  <g key={d.id}>
                    <line
                      ref={(el) => {
                        const id = `destination:${d.id}`;
                        if (el) labelLeaders.current.set(id, el);
                        else labelLeaders.current.delete(id);
                      }}
                    />
                    <circle
                      r="3"
                      ref={(el) => {
                        const id = `destination:${d.id}`;
                        if (el) destinationDots.current.set(id, el);
                        else destinationDots.current.delete(id);
                      }}
                    />
                  </g>
                ))}
            </svg>
          )}
          <div className="bwiq-pitch-labels">
            {scenario.players
              .filter((p) => !visibleLabelIds || visibleLabelIds.includes(p.id))
              .map((player) => (
                <button
                  key={player.id}
                  data-iq-player={player.id}
                  style={
                    status !== "ready"
                      ? {
                          left: `${frame.positions.get(player.id)?.x ?? player.x}%`,
                          top: `${((frame.positions.get(player.id)?.y ?? player.y) / 140) * 100}%`,
                          background:
                            player.team === "home" ? "#44a6d8" : "#ecebe2",
                          borderRadius: "50%",
                        }
                      : undefined
                  }
                  type="button"
                  className={`bwiq-player-hit bwiq-player-hit--${player.team}${showGuidance && interactive && selectedPlayerId === player.id ? " is-selected" : ""}${showGuidance && frame.ballCarrierId === player.id && !frame.ballInFlight ? " has-ball" : ""}${showGuidance && interactive && ["pass", "through", "cross"].includes(mode) && player.team === "home" && frame.ballCarrierId !== player.id ? " is-pass-target" : ""}`}
                  ref={(element) => {
                    if (element) playerLabels.current.set(player.id, element);
                    else playerLabels.current.delete(player.id);
                  }}
                  disabled={
                    !interactive ||
                    (!freeMovement &&
                      !!selectablePlayerIds &&
                      !selectablePlayerIds.includes(player.id))
                  }
                  aria-label={`Zawodnik ${player.number}, ${player.role}${player.controlled ? ", Ty" : ""}${frame.ballCarrierId === player.id && !frame.ballInFlight ? ", z piłką" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (
                      interactive &&
                      (mode === "carry" || freeMovement) &&
                      event.detail > 0
                    )
                      selectPoint(event);
                    else onPlayerSelect(player);
                  }}
                >
                  <span>{player.controlled ? "TY" : player.number}</span>
                </button>
              ))}
            <div
              ref={ballLabel}
              className="bwiq-ball-marker"
              aria-label="Piłka"
            >
              <span />
            </div>
            {showGuidance &&
              showActionOrders &&
              actions.map((action, index) =>
                action.type === "shot" ? null : (
                  <span
                    key={action.id}
                    className="bwiq-action-order"
                    ref={(element) => {
                      if (element) routeLabels.current.set(action.id, element);
                      else routeLabels.current.delete(action.id);
                    }}
                  >
                    {index + 1}
                  </span>
                ),
              )}
          </div>
          {showGuidance &&
            destinations.map((destination) => (
              <button
                key={destination.id}
                data-iq-destination={destination.id}
                style={
                  status !== "ready"
                    ? {
                        left: `${destination.point.x}%`,
                        top: `${(destination.point.y / 140) * 100}%`,
                      }
                    : undefined
                }
                type="button"
                className="bwiq-destination"
                ref={(element) => {
                  if (element)
                    destinationLabels.current.set(destination.id, element);
                  else destinationLabels.current.delete(destination.id);
                }}
                aria-label={destination.label}
                disabled={!interactive}
                onClick={(event) => {
                  event.stopPropagation();
                  if (interactive) onDestinationSelect?.(destination.id);
                }}
              >
                {destination.shortLabel}
              </button>
            ))}
        </>
      )}
    </div>
  );
}
