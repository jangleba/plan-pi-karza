import { supabase } from "@/integrations/supabase/client";
import { assertNoSupabaseError } from "@/integrations/supabase/errors";
import { ENGINE_VERSION } from "./model";
import type { SessionDay } from "../types";

export async function loadV2Plan(userId: string, signal?: AbortSignal) {
  let query = supabase
    .from("training_plans")
    .select("id,plan_json")
    .eq("user_id", userId)
    .eq("active", true);
  if (signal) query = query.abortSignal(signal);
  const result = await query.maybeSingle();
  assertNoSupabaseError("training_plans.load_v2", result.error);
  const value = result.data?.plan_json;
  const supportedVersions = [
    "ballwise-v2.1",
    "ballwise-v2.2",
    "ballwise-v2.3",
    "ballwise-v2.4",
    ENGINE_VERSION,
  ];
  if (
    Array.isArray(value) &&
    value.some(
      (d) =>
        d &&
        typeof d === "object" &&
        !Array.isArray(d) &&
        typeof d.generatorVersion === "string" &&
        d.generatorVersion.startsWith("ballwise-v2") &&
        !supportedVersions.includes(d.generatorVersion),
    )
  )
    throw new Error(
      "Zapisany plan pochodzi z innej wersji silnika. Odśwież aplikację przed zmianą planu.",
    );
  // Do not revive the removed legacy generator's cached plans.
  const plan =
    Array.isArray(value) &&
    value.length &&
    value.every(
      (d) =>
        d &&
        typeof d === "object" &&
        !Array.isArray(d) &&
        typeof d.generatorVersion === "string" &&
        supportedVersions.includes(d.generatorVersion),
    )
      ? (value as unknown as SessionDay[])
      : [];
  for (const day of plan)
    for (const slot of [day, ...(day.secondSession ? [day.secondSession] : [])]) {
      if (
        typeof slot.date !== "string" ||
        typeof slot.title !== "string" ||
        !slot.sections ||
        !["warmup", "main", "accessory", "footballTransfer", "cooldown"].every((k) =>
          Array.isArray(slot.sections[k as keyof typeof slot.sections]),
        ) ||
        slot.secondSession?.secondSession
      )
        throw new Error("Zapisany plan ma niepełną strukturę. Nie został nadpisany.");
      if (
        slot.engineV2 &&
        (!Array.isArray(slot.engineV2.exercises) ||
          !Array.isArray(slot.engineV2.roles) ||
          !Number.isFinite(slot.engineV2.minutes))
      )
        throw new Error("Zapisany plan ma niepełne dawki. Nie został nadpisany.");
    }
  return { id: result.data?.id, plan };
}
