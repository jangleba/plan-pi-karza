import { Capacitor, registerPlugin } from "@capacitor/core";
import type { NativeVideoCapture } from "./types";

export interface BallWiseCameraCapabilities {
  supported: boolean;
  fps: number;
  width: number;
  height: number;
  camera: "back";
  reason?: string;
}

interface FrameResponse {
  dataUrl: string;
  requestedFrame: number;
  actualTimeSeconds: number;
}

interface BallWiseCameraPlugin {
  capabilities(): Promise<BallWiseCameraCapabilities>;
  record(options: { maxDurationSeconds: number }): Promise<NativeVideoCapture>;
  frameAt(options: { path: string; frameIndex: number; maxWidth: number }): Promise<FrameResponse>;
  deleteVideo(options: { path: string }): Promise<void>;
}

const NativeCamera = registerPlugin<BallWiseCameraPlugin>("BallWiseCamera");

export function isNativeIosLab() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export async function getCameraCapabilities(): Promise<BallWiseCameraCapabilities> {
  if (!isNativeIosLab()) {
    return {
      supported: false,
      fps: 0,
      width: 0,
      height: 0,
      camera: "back",
      reason: "Nagrywanie 240 FPS działa w natywnej aplikacji BallWise na iPhone.",
    };
  }
  return NativeCamera.capabilities();
}

export async function recordLabVideo(maxDurationSeconds: number) {
  if (!isNativeIosLab()) {
    throw new Error("Otwórz BallWise na iPhone, aby nagrać test w 240 FPS.");
  }
  return NativeCamera.record({ maxDurationSeconds });
}

export async function loadExactFrame(path: string, frameIndex: number, maxWidth = 1280) {
  if (!isNativeIosLab()) return null;
  return NativeCamera.frameAt({ path, frameIndex, maxWidth });
}

export async function deleteLabVideo(path: string | null | undefined) {
  if (!path || !isNativeIosLab()) return;
  try {
    await NativeCamera.deleteVideo({ path });
  } catch {
    // Plik jest materiałem roboczym. Brak pliku po wcześniejszym sprzątaniu jest bezpieczny.
  }
}
