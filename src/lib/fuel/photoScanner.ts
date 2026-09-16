import { supabase } from "@/integrations/supabase/client";
import type { FuelSessionInput } from "./types";

export type ScanConfidence = "high" | "medium" | "low";

export interface ScannedMealItem {
  label: string;
  confidence: ScanConfidence;
  portionHint: string;
}

export interface MealPhotoAnalysis {
  safeToAnalyze: boolean;
  summary: string;
  items: ScannedMealItem[];
  clarificationQuestion: string | null;
  clarificationOptions: string[];
  estimate: {
    caloriesMin: number;
    caloriesMax: number;
    carbsMinG: number;
    carbsMaxG: number;
    proteinMinG: number;
    proteinMaxG: number;
    fatMinG: number;
    fatMaxG: number;
  };
  confidence: ScanConfidence;
}

export interface PreparedMealPhoto {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
}

const MAX_EDGE_PX = 1280;
const MAX_INPUT_BYTES = 8 * 1024 * 1024;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Nie udało się odczytać zdjęcia."));
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Nie udało się przygotować zdjęcia."))),
      "image/jpeg",
      0.82,
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Nie udało się odczytać zdjęcia."));
    reader.readAsDataURL(blob);
  });
}

export async function prepareMealPhoto(file: File): Promise<PreparedMealPhoto> {
  if (!file.type.startsWith("image/")) throw new Error("Wybierz plik ze zdjęciem.");
  if (file.size > MAX_INPUT_BYTES) throw new Error("Zdjęcie jest za duże. Maksymalnie 8 MB.");

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Przeglądarka nie obsługuje przygotowania zdjęcia.");
    context.drawImage(image, 0, 0, width, height);
    const blob = await canvasBlob(canvas);
    return { dataUrl: await blobToDataUrl(blob), width, height, bytes: blob.size };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function analyzeMealPhoto(
  photo: PreparedMealPhoto,
  session: FuelSessionInput,
): Promise<MealPhotoAnalysis> {
  const { data, error } = await supabase.functions.invoke<MealPhotoAnalysis>(
    "analyze-fuel-photo",
    {
      body: {
        imageDataUrl: photo.dataUrl,
        session: {
          kind: session.kind,
          intensity: session.intensity,
          durationMin: session.durationMin,
        },
      },
    },
  );

  if (error) {
    const context = error.context as Response | undefined;
    let message = "Nie udało się przeanalizować zdjęcia.";
    if (context) {
      try {
        const payload = (await context.clone().json()) as { message?: string; error?: string };
        if (payload.message) message = payload.message;
        else if (payload.error === "ai_not_configured")
          message = "Skaner nie jest jeszcze połączony z usługą analizy obrazu.";
      } catch {
        // Keep the safe, user-facing fallback above.
      }
    }
    throw new Error(message);
  }
  if (!data || !Array.isArray(data.items)) throw new Error("Analiza zwróciła niepełny wynik.");
  return data;
}

export function scannedMealText(
  analysis: MealPhotoAnalysis,
  clarification: string | null,
): string {
  return analysis.items
    .map((item) => item.label)
    .concat(clarification ? [clarification] : [])
    .join(", ");
}
