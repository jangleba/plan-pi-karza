import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { createPlayback, samplePlayback } from "./playback";
import type { TeachingMarker } from "./teaching";
import type { PitchScene } from "./pitchScene";
import type { ActionMode, MatchPlayer, PlannedAction, Point, Scenario } from "./types";
import type { PlaybackFrame } from "./animation";
const NO_ACTIONS: PlannedAction[] = [];

type Props = {
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
  selectablePlayerIds?: string[];
  destinations?: { id: string; point: Point; label: string }[];
  onDestinationSelect?: (id: string) => void;
  showActionOrders?: boolean;
  showGuidance?: boolean;
  freeMovement?: boolean;
};
export function TacticalPitch({
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
  selectablePlayerIds,
  destinations = [],
  onDestinationSelect,
  showActionOrders = true,
  showGuidance = true,
  freeMovement = false,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<PitchScene | null>(null);
  const ballLabel = useRef<HTMLDivElement>(null);
  const teachingLabels = useRef(new Map<string, HTMLButtonElement>());
  const highlightLabels = useRef(new Map<number, HTMLDivElement>());
  const playerLabels = useRef(new Map<string, HTMLButtonElement>());
  const routeLabels = useRef(new Map<string, HTMLSpanElement>());
  const destinationLabels = useRef(new Map<string, HTMLButtonElement>());
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const [attempt, setAttempt] = useState(0);
  const playback = useMemo(() => createPlayback(scenario, actions), [scenario, actions]);
  const sampledFrame = useMemo(
    () => samplePlayback(playback, interactive ? 1 : playbackProgress),
    [playback, interactive, playbackProgress],
  );
  const frame = frameOverride ?? sampledFrame;
  const latest = useRef({
    frame,
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
  });
  latest.current = {
    frame,
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
  };

  function sync() {
    const api = scene.current;
    if (!api) return;
    const state = latest.current;
    api.update(
      state.frame,
      state.showGuidance ? state.actions : NO_ACTIONS,
      state.interactive && state.showGuidance ? state.selectedPlayerId : null,
      state.playing,
      state.focusOnActions,
      state.cameraActions,
      state.activeActionId,
      state.showGuidance
        ? state.teachingMarkers.find((m) => m.id === state.activeTeachingId)?.point
        : undefined,
      state.showGuidance,
    );
    playerLabels.current.forEach((element, id) => {
      const point = state.frame.positions.get(id);
      if (!point) return;
      const p = api.project(point, 7.5);
      element.style.left = `${p.x}px`;
      element.style.top = `${p.y}px`;
    });
    // Keep the 44 px hit region attached to the player. Only displace the small
    // number badge when a tightly marked pair would otherwise cover each other.
    const occupied: { x: number; y: number }[] = [];
    const hostWidth = host.current?.clientWidth ?? 0;
    playerLabels.current.forEach((element) => {
      const x = parseFloat(element.style.left),
        y = parseFloat(element.style.top);
      const candidates = [
        { x: 0, y: 0 },
        { x: 22, y: 0 },
        { x: -22, y: 0 },
        { x: 0, y: -22 },
        { x: 22, y: -22 },
      ];
      const offset =
        candidates.find(
          (offset) =>
            x + offset.x >= 12 &&
            x + offset.x <= hostWidth - 12 &&
            !occupied.some(
              (p) => Math.abs(p.x - x - offset.x) < 21 && Math.abs(p.y - y - offset.y) < 21,
            ),
        ) ?? candidates[0];
      element.style.setProperty("--iq-badge-x", `${offset.x}px`);
      element.style.setProperty("--iq-badge-y", `${offset.y}px`);
      occupied.push({ x: x + offset.x, y: y + offset.y });
    });
    state.destinations.forEach((destination) => {
      const element = destinationLabels.current.get(destination.id);
      if (!element) return;
      const projected = api.project(destination.point, 0.1);
      element.style.left = `${projected.x}px`;
      element.style.top = `${projected.y}px`;
    });
    if (ballLabel.current) {
      const p = api.project(state.frame.ballVisual, state.frame.ballHeight);
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
    let cancelled = false;
    let failed = false;
    const controller = new AbortController();
    let api: PitchScene | null = null;
    let observer: ResizeObserver | null = null;
    setStatus("loading");
    latest.current.onReadyChange?.(false);
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
        api = await createPitchScene(element, scenario.players, fail, controller.signal);
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
  }, [scenario.players, attempt]);
  useEffect(() => {
    sync();
  }, [
    frame,
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
  ]);
  const selectPoint = (event: Pick<MouseEvent<HTMLDivElement>, "clientX" | "clientY">) => {
    if (!interactive || status === "loading") return;
    const api = scene.current;
    if (!host.current) return;
    const bounds = host.current.getBoundingClientRect();
    const x = event.clientX - bounds.left,
      y = event.clientY - bounds.top;
    const nearest = scenario.players
      .map((player) => {
        const point = frame.positions.get(player.id)!;
        const p = api
          ? api.project(point, 7.5)
          : { x: (point.x / 100) * bounds.width, y: (point.y / 140) * bounds.height };
        return { player, distance: Math.hypot(p.x - x, p.y - y) };
      })
      .sort((a, b) => a.distance - b.distance)[0];
    if (
      !freeMovement &&
      ["pass", "through", "cross", "hold", "press", "mark"].includes(mode) &&
      nearest &&
      nearest.distance <= 23 &&
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
      className={`bwiq-pitch-wrap bwiq-pitch-wrap--3d${showGuidance ? "" : " bwiq-pitch-wrap--independent"}`}
      onClick={selectPoint}
    >
      <div className="bwiq-pitch-canvas" ref={host} />
      {status === "fallback" && (
        <>
          <svg
            viewBox="0 0 100 140"
            preserveAspectRatio="none"
            aria-label="Boisko w trybie uproszczonym"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              background: "#1b4a40",
            }}
          >
            <g fill="none" stroke="#c5dacb" strokeWidth="0.5">
              <rect x="2" y="3" width="96" height="134" />
              <path d="M2 70H98M22 3V27H78V3M22 137V113H78V137" />
              <circle cx="50" cy="70" r="9" />
            </g>
            <circle cx={frame.ballVisual.x} cy={frame.ballVisual.y} r="1.1" fill="white" />
          </svg>
          <div
            role="status"
            style={{
              position: "absolute",
              top: 6,
              left: 8,
              right: 8,
              zIndex: 5,
              fontSize: 11,
              pointerEvents: "none",
            }}
          >
            Tryb uproszczony · akcja i wybory pozostają dostępne.
            <button
              type="button"
              style={{ pointerEvents: "auto", marginLeft: 8 }}
              onClick={(event) => {
                event.stopPropagation();
                setAttempt((n) => n + 1);
              }}
            >
              Spróbuj boiska 3D
            </button>
          </div>
        </>
      )}
      <div className="bwiq-pitch-legend">
        <span>{scenario.defensive ? "↓ Twoja bramka" : "↑ Atakujesz"}</span>
        <span>
          <i /> Piłka
        </span>
      </div>
      {showGuidance &&
        highlights?.map((point, i) => {
          const p = scene.current?.project(point, 0.2);
          return p || status === "fallback" ? (
            <div
              key={i}
              className={highlightGood ? "bwiq-highlight bwiq-highlight--good" : "bwiq-highlight"}
              ref={(element) => {
                if (element) highlightLabels.current.set(i, element);
                else highlightLabels.current.delete(i);
              }}
              style={
                status === "fallback"
                  ? { left: `${point.x}%`, top: `${(point.y / 140) * 100}%` }
                  : { left: p!.x, top: p!.y }
              }
              aria-label={highlightGood ? "Miejsce stworzenia przewagi" : "Miejsce do poprawy"}
            />
          ) : null;
        })}
      {showGuidance &&
        status !== "loading" &&
        teachingMarkers.map((marker) => (
          <button
            key={marker.id}
            style={
              status === "fallback"
                ? { left: `${marker.point.x}%`, top: `${(marker.point.y / 140) * 100}%` }
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
      <div className={`bwiq-pitch-labels${status === "loading" ? " is-loading" : ""}`}>
        {scenario.players.map((player) => (
          <button
            key={player.id}
            data-iq-player={player.id}
            style={
              status === "fallback"
                ? {
                    left: `${frame.positions.get(player.id)?.x ?? player.x}%`,
                    top: `${((frame.positions.get(player.id)?.y ?? player.y) / 140) * 100}%`,
                    background: player.team === "home" ? "#44a6d8" : "#ecebe2",
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
              status === "loading" ||
              (!freeMovement && !!selectablePlayerIds && !selectablePlayerIds.includes(player.id))
            }
            aria-label={`Zawodnik ${player.number}, ${player.role}${player.controlled ? ", Ty" : ""}${frame.ballCarrierId === player.id && !frame.ballInFlight ? ", z piłką" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              if (interactive && (mode === "carry" || freeMovement) && event.detail > 0)
                selectPoint(event);
              else onPlayerSelect(player);
            }}
          >
            {player.controlled && <small>TY</small>}
            <span>{player.number}</span>
          </button>
        ))}
        <div ref={ballLabel} className="bwiq-ball-marker" aria-label="Piłka">
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
        status !== "loading" &&
        destinations.map((destination) => (
          <button
            key={destination.id}
            data-iq-destination={destination.id}
            style={
              status === "fallback"
                ? { left: `${destination.point.x}%`, top: `${(destination.point.y / 140) * 100}%` }
                : undefined
            }
            type="button"
            className="bwiq-destination"
            ref={(element) => {
              if (element) destinationLabels.current.set(destination.id, element);
              else destinationLabels.current.delete(destination.id);
            }}
            aria-label={destination.label}
            disabled={!interactive}
            onClick={(event) => {
              event.stopPropagation();
              if (interactive) onDestinationSelect?.(destination.id);
            }}
          />
        ))}
      {status === "loading" && (
        <div className="bwiq-model-status" role="status">
          <span>Ładowanie zawodników…</span>
        </div>
      )}
    </div>
  );
}
