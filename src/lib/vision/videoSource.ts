import { getVisionVideoUrl } from "./visionRepo";

/** Błąd pozyskania/wczytania źródła wideo z konkretnym kodem. */
export class VideoSourceError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "VideoSourceError";
    this.code = code;
  }
}

export interface ResolvedVideoBlob {
  /** Blob URL — bezpieczne źródło dla playera i analizy (Safari-friendly). */
  objectUrl: string;
  size: number;
  type: string;
}

/**
 * Pozyskuje film jako lokalny Blob URL:
 * 1. lokalny File (z uploadu) → Blob URL bezpośrednio,
 * 2. ścieżka w storage → świeży signed URL → fetch → walidacja → Blob URL.
 *
 * Nie używamy signed URL bezpośrednio jako src (Safari bywa zawodny).
 * Zawsze rzuca VideoSourceError z konkretnym kodem albo zwraca Blob URL.
 */
export async function resolveVideoBlob(opts: {
  file: File | null;
  videoUrl: string | null;
  uploaded: boolean;
  signal?: AbortSignal;
}): Promise<ResolvedVideoBlob> {
  const { file, videoUrl, uploaded, signal } = opts;

  // 1. Lokalny plik z uploadu — najpewniejsze źródło.
  if (file) {
    if (!file.size) throw new VideoSourceError("VIDEO_FILE_EMPTY", "Wybrany plik jest pusty.");
    return { objectUrl: URL.createObjectURL(file), size: file.size, type: file.type };
  }

  // 2. Storage: potrzebna prawdziwa ścieżka.
  if (!videoUrl || !uploaded || videoUrl.startsWith("placeholder://")) {
    throw new VideoSourceError("NO_VIDEO_SOURCE", "Brak filmu do analizy.");
  }

  // Świeży signed URL (poprzedni mógł wygasnąć).
  const signedUrl = videoUrl.startsWith("http") ? videoUrl : await getVisionVideoUrl(videoUrl);
  if (!signedUrl) {
    throw new VideoSourceError("SIGNED_URL_FAILED", "Nie udało się pobrać adresu filmu ze storage.");
  }

  let response: Response;
  try {
    response = await fetch(signedUrl, { signal });
  } catch {
    throw new VideoSourceError("VIDEO_DOWNLOAD_FAILED", "Nie udało się pobrać pliku filmu.");
  }
  if (!response.ok) {
    throw new VideoSourceError("VIDEO_DOWNLOAD_FAILED", `HTTP ${response.status}`);
  }

  const blob = await response.blob();
  if (!blob.size) throw new VideoSourceError("VIDEO_FILE_EMPTY", "Pobrany plik filmu jest pusty.");
  if (!blob.type.startsWith("video/") && blob.type !== "application/octet-stream") {
    throw new VideoSourceError("INVALID_VIDEO_CONTENT_TYPE", `Nieprawidłowy typ pliku: ${blob.type}`);
  }

  return { objectUrl: URL.createObjectURL(blob), size: blob.size, type: blob.type };
}
