import type { FuelEntry, QuickSignals } from "../engine/fuelEngine";

export interface NewFuelEntry {
  athleteId: string;
  sessionId?: string;
  loggedAt: string;
  kind: FuelEntry["kind"];
  label: string;
  inputMethod: "tap" | "voice" | "photo" | "recent";
  payload?: Record<string, unknown>;
}

export interface FuelPersistenceAdapter {
  listEntries(athleteId: string, fromIso: string, toIso: string): Promise<FuelEntry[]>;
  addEntry(entry: NewFuelEntry): Promise<FuelEntry>;
  saveQuickSignals(athleteId: string, signals: QuickSignals): Promise<void>;
}

export const memoryFuelAdapter = (): FuelPersistenceAdapter => {
  const entries: FuelEntry[] = [];
  const signals = new Map<string, QuickSignals>();

  return {
    async listEntries(athleteId, fromIso, toIso) {
      const from = new Date(fromIso).getTime();
      const to = new Date(toIso).getTime();
      return entries.filter((entry) => {
        const timestamp = new Date(entry.loggedAt).getTime();
        return timestamp >= from && timestamp <= to && (entry as FuelEntry & { athleteId?: string }).athleteId === athleteId;
      });
    },
    async addEntry(entry) {
      const saved: FuelEntry & { athleteId: string } = {
        id: globalThis.crypto.randomUUID(),
        athleteId: entry.athleteId,
        loggedAt: entry.loggedAt,
        kind: entry.kind,
        label: entry.label,
        sessionId: entry.sessionId
      };
      entries.push(saved);
      return saved;
    },
    async saveQuickSignals(athleteId, nextSignals) {
      signals.set(athleteId, nextSignals);
    }
  };
};

