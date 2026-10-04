import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { createPlayback, samplePlayback } from "./playback";
import type { PitchScene } from "./pitchScene";
import type { ActionMode, MatchPlayer, PlannedAction, Point, Scenario } from "./types";

type Props = {
  scenario: Scenario;
  actions: PlannedAction[];
  selectedPlayerId: string;
  mode: ActionMode;
  interactive: boolean;
  playbackProgress?: number;
  playing?: boolean;
  onModeChange: (mode: ActionMode) => void;
  onPlayerSelect: (player: MatchPlayer) => void;
  onPitchSelect: (point: Point) => void;
  onReadyChange?: (ready: boolean) => void;
};
export function TacticalPitch({
  scenario,
  actions,
  selectedPlayerId,
  mode,
  interactive,
  playbackProgress = 0,
  playing = false,
  onModeChange,
  onPlayerSelect,
  onPitchSelect,
  onReadyChange,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<PitchScene | null>(null);
  const playerLabels = useRef(new Map<string, HTMLButtonElement>());
  const routeLabels = useRef(new Map<string, HTMLSpanElement>());
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const playback = useMemo(() => createPlayback(scenario, actions), [scenario, actions]);
  const frame = useMemo(
    () => samplePlayback(playback, interactive ? 1 : playbackProgress),
    [playback, interactive, playbackProgress],
  );
  const latest = useRef({ frame, actions, selectedPlayerId, interactive, playing, onReadyChange });
  latest.current = { frame, actions, selectedPlayerId, interactive, playing, onReadyChange };

  function sync() {
    const api = scene.current;
    if (!api) return;
    const state = latest.current;
    api.update(
      state.frame,
      state.actions,
      state.interactive ? state.selectedPlayerId : null,
      state.playing,
    );
    playerLabels.current.forEach((element, id) => {
      const point = state.frame.positions.get(id);
      if (!point) return;
      const p = api.project(point);
      element.style.left = `${p.x}px`;
      element.style.top = `${p.y}px`;
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
    let api: PitchScene | null = null;
    let observer: ResizeObserver | null = null;
    setStatus("loading");
    latest.current.onReadyChange?.(false);
    const fail = () => {
      if (cancelled) return;
      setStatus("error");
      latest.current.onReadyChange?.(false);
    };
    void import("./pitchScene")
      .then(async ({ createPitchScene }) => {
        if (cancelled) return;
        api = await createPitchScene(element, scenario.players, fail);
        if (cancelled) {
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
      observer?.disconnect();
      scene.current = null;
      api?.dispose();
    };
  }, [scenario.players, attempt]);
  useEffect(() => {
    sync();
  }, [frame, actions, selectedPlayerId, interactive, playing]);
  const selectPoint = (event: MouseEvent<HTMLDivElement>) => {
    if (!interactive || status !== "ready") return;
    const point = scene.current?.pick(event.clientX, event.clientY);
    if (point) onPitchSelect(point);
  };
  return (
    <div className="bwiq-pitch-wrap bwiq-pitch-wrap--3d" onClick={selectPoint}>
      <div className="bwiq-pitch-canvas" ref={host} />
      <div className={`bwiq-pitch-labels${status !== "ready" ? " is-loading" : ""}`}>
        {scenario.players.map((player) => (
          <button
            key={player.id}
            type="button"
            className={`bwiq-player-hit bwiq-player-hit--${player.team}${interactive && selectedPlayerId === player.id ? " is-selected" : ""}`}
            ref={(element) => {
              if (element) playerLabels.current.set(player.id, element);
              else playerLabels.current.delete(player.id);
            }}
            disabled={!interactive || status !== "ready"}
            aria-label={`Zawodnik ${player.number}, ${player.role}${player.controlled ? ", Ty" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              onPlayerSelect(player);
            }}
          >
            {player.controlled && <small>TY</small>}
            <span>{player.number}</span>
          </button>
        ))}
        {actions.map((action, index) => (
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
        ))}
      </div>
      {status !== "ready" && (
        <div className="bwiq-model-status" role="status">
          {status === "loading" ? (
            <span>Ładowanie zawodników…</span>
          ) : (
            <>
              <span>Nie udało się wczytać boiska.</span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setAttempt((n) => n + 1);
                }}
              >
                Wczytaj ponownie
              </button>
            </>
          )}
        </div>
      )}
      {interactive && status === "ready" && (
        <div
          className="bwiq-action-menu"
          role="group"
          aria-label="Rodzaj działania"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            className={mode === "run" ? "active" : ""}
            type="button"
            onClick={() => onModeChange("run")}
          >
            <i>↗</i>
            <span>Bieg</span>
          </button>
          <button
            className={mode === "pass" ? "active" : ""}
            type="button"
            onClick={() => onModeChange("pass")}
          >
            <i>●</i>
            <span>Podanie</span>
          </button>
          <button
            className={mode === "shift" ? "active" : ""}
            type="button"
            onClick={() => onModeChange("shift")}
          >
            <i>↔</i>
            <span>Przesuń</span>
          </button>
        </div>
      )}
    </div>
  );
}
