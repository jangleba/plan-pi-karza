import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { LabResult } from "./types";
import { labResultSchema } from "./resultSchema";

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type LabRow = {
  id: string;
  user_id: string;
  batch_id: string;
  test_id: string;
  side: string | null;
  trial_number: number;
  recorded_at: string;
  fps: number;
  frame_count: number;
  first_frame: number;
  second_frame: number;
  trim_start_frame: number;
  trim_end_frame: number;
  first_guide_position: number;
  second_guide_position: number;
  guide_axis: string;
  primary_value: number;
  primary_unit: string;
  metrics: Json;
  quality: Json;
  protocol_version: string;
  created_at: string;
};

type LabInsert = Omit<LabRow, "created_at"> & { created_at?: string };

type LabDatabase = {
  public: {
    Tables: {
      lab_test_results: {
        Row: LabRow;
        Insert: LabInsert;
        Update: Partial<LabInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const labClient = supabase as unknown as SupabaseClient<LabDatabase>;

function key(userId: string) {
  return `ballwise:lab:results:${userId}`;
}

function readLocal(userId: string): LabResult[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key(userId)) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.flatMap((item) => {
          const decoded = labResultSchema.safeParse(item);
          return decoded.success && decoded.data.userId === userId ? [decoded.data] : [];
        })
      : [];
  } catch {
    return [];
  }
}

function writeLocal(userId: string, results: readonly LabResult[]) {
  if (typeof window === "undefined") throw new Error("Zapis lokalny jest niedostępny.");
  let syncedCount = 0;
  const retained = results.filter(
    (result) => !result.synced || result.testId === "sprint_10m_ball" || ++syncedCount <= 300,
  );
  window.localStorage.setItem(key(userId), JSON.stringify(retained));
}

function toInsert(result: LabResult): LabInsert {
  return {
    id: result.id,
    user_id: result.userId,
    batch_id: result.batchId,
    test_id: result.testId,
    side: result.side,
    trial_number: result.trialNumber,
    recorded_at: result.recordedAt,
    fps: result.fps,
    frame_count: result.frameCount,
    first_frame: result.firstFrame,
    second_frame: result.secondFrame,
    trim_start_frame: result.trimStartFrame,
    trim_end_frame: result.trimEndFrame,
    first_guide_position: result.firstGuidePosition,
    second_guide_position: result.secondGuidePosition,
    guide_axis: result.guideAxis,
    primary_value: result.metrics.primaryValue,
    primary_unit: result.metrics.primaryUnit,
    metrics: result.metrics as unknown as Json,
    quality: result.quality as unknown as Json,
    protocol_version: result.quality.protocolVersion,
  };
}

function fromRow(row: LabRow): LabResult {
  return {
    id: row.id,
    userId: row.user_id,
    batchId: row.batch_id,
    testId: row.test_id as LabResult["testId"],
    side: row.side as LabResult["side"],
    trialNumber: row.trial_number,
    recordedAt: row.recorded_at,
    fps: Number(row.fps),
    frameCount: row.frame_count,
    firstFrame: row.first_frame,
    secondFrame: row.second_frame,
    trimStartFrame: row.trim_start_frame,
    trimEndFrame: row.trim_end_frame,
    firstGuidePosition: Number(row.first_guide_position),
    secondGuidePosition: Number(row.second_guide_position),
    guideAxis: row.guide_axis as LabResult["guideAxis"],
    metrics: row.metrics as unknown as LabResult["metrics"],
    quality: row.quality as unknown as LabResult["quality"],
    synced: true,
  };
}

export function mergeLabResults(local: readonly LabResult[], cloud: readonly LabResult[]) {
  const byId = new Map<string, LabResult>();
  for (const result of [...local, ...cloud]) {
    const previous = byId.get(result.id);
    if (!previous?.synced || result.synced) byId.set(result.id, result);
  }
  return [...byId.values()].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}

const uploads = new Map<string, Promise<void>>();

function upload(result: LabResult): Promise<void> {
  const uploadKey = `${result.userId}:${result.id}`;
  const running = uploads.get(uploadKey);
  if (running) return running;
  const promise = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const { error } = await labClient
        .from("lab_test_results")
        .insert(toInsert(result))
        .abortSignal(controller.signal);
      if (error && error.code !== "23505") throw error;
    } finally {
      clearTimeout(timeout);
    }
  })().finally(() => uploads.delete(uploadKey));
  uploads.set(uploadKey, promise);
  return promise;
}

function markSynced(result: LabResult) {
  const synced = { ...result, synced: true };
  writeLocal(result.userId, mergeLabResults(readLocal(result.userId), [synced]));
  return synced;
}

export function listLocalLabResults(userId: string) {
  return readLocal(userId).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}

export async function saveLabResult(result: LabResult) {
  labResultSchema.parse(result);
  const local = readLocal(result.userId);
  const existing = local.find((item) => item.id === result.id);
  if (existing?.synced) return { result: existing, cloudSaved: true };
  result = existing ?? result;
  const stored = mergeLabResults(local, [result]);
  writeLocal(result.userId, stored);

  try {
    await upload(result);
    return { result: markSynced(result), cloudSaved: true };
  } catch {
    return { result, cloudSaved: false };
  }
}

export async function loadLabResults(userId: string) {
  try {
    const { data, error } = await labClient
      .from("lab_test_results")
      .select("*")
      .eq("user_id", userId)
      .order("recorded_at", { ascending: false })
      .limit(300);
    if (error) throw error;
    const cloud = (data ?? []).flatMap((row) => {
      const decoded = labResultSchema.safeParse(fromRow(row));
      return decoded.success && decoded.data.userId === userId ? [decoded.data] : [];
    });
    const merged = mergeLabResults(readLocal(userId), cloud);
    writeLocal(userId, merged);
    return merged;
  } catch {
    return listLocalLabResults(userId);
  }
}

export async function syncPendingLabResults(userId: string) {
  const local = readLocal(userId);
  for (const result of local) {
    if (result.synced) continue;
    try {
      await upload(result);
      markSynced(result);
    } catch {
      // Keep the current local record queued, including results saved during this upload.
    }
  }
  return listLocalLabResults(userId);
}
