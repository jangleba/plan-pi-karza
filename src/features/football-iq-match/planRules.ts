import type { PlannedAction } from "./types";

export const MAX_PLAN_ACTIONS = 3;
export const MAX_PLAN_PASSES = 1;

export type PlanActionKind = PlannedAction["type"];

const participantIds = (actions: PlannedAction[]) => {
  const ids = new Set<string>();
  actions.forEach((action) => {
    if (action.type === "run") {
      action.moves.forEach((move) => ids.add(move.playerId));
      return;
    }
    if (action.passerId) ids.add(action.passerId);
    if (action.receiverId) ids.add(action.receiverId);
  });
  return ids;
};

export const canAppendAction = (actions: PlannedAction[], type: PlanActionKind) => {
  if (actions.length >= MAX_PLAN_ACTIONS) {
    return { allowed: false, message: "Wariant ma już 3 akcje — cofnij krok albo go odtwórz." } as const;
  }
  if (type === "pass" && actions.filter((action) => action.type === "pass").length >= MAX_PLAN_PASSES) {
    return { allowed: false, message: "W jednej scenie możesz zaplanować najwyżej jedno podanie." } as const;
  }
  return { allowed: true, message: "" } as const;
};

export const canUseParticipant = (
  actions: PlannedAction[],
  playerId: string | undefined,
  controlledPlayerId: string,
) => {
  if (!playerId || playerId === controlledPlayerId) return { allowed: true, message: "" } as const;
  const partners = participantIds(actions);
  partners.delete(controlledPlayerId);
  if (!partners.has(playerId) && partners.size >= 2) {
    return {
      allowed: false,
      message: "Wariant może obejmować Ciebie i maksymalnie 2 partnerów.",
    } as const;
  }
  return { allowed: true, message: "" } as const;
};

export const canAppendPlannedAction = (
  actions: PlannedAction[],
  action: PlannedAction,
  controlledPlayerId: string,
) => {
  const actionAllowance = canAppendAction(actions, action.type);
  if (!actionAllowance.allowed) return actionAllowance;
  const combinedParticipants = participantIds([...actions, action]);
  combinedParticipants.delete(controlledPlayerId);
  if (combinedParticipants.size > 2) {
    return {
      allowed: false,
      message: "Wariant może obejmować Ciebie i maksymalnie 2 partnerów.",
    } as const;
  }
  return { allowed: true, message: "" } as const;
};
