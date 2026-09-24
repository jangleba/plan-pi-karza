export { FuelPilot, type FuelPilotProps } from "./FuelPilot";
export {
  buildFuelRecommendation,
  EVIDENCE_SOURCES,
  MEAL_OPTIONS,
  type AthleteProfile,
  type FuelContext,
  type FuelEntry,
  type FuelRecommendation,
  type MealOption,
  type QuickSignals,
  type TrainingSession
} from "./engine/fuelEngine";
export {
  memoryFuelAdapter,
  type FuelPersistenceAdapter,
  type NewFuelEntry
} from "./adapters/FuelPersistenceAdapter";
export { createSupabaseFuelAdapter } from "./adapters/createSupabaseFuelAdapter";
