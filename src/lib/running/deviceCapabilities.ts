import { Capacitor } from "@capacitor/core";
import { nativeRecorder, nativeRunningAvailable } from "./nativeRecorder";

/** No user/profile/location values. Export this report during real-device acceptance. */
export async function deviceCapabilityReport() {
  const probe = {
    generatedAt: new Date().toISOString(),
    platform: Capacitor.getPlatform(),
    native: Capacitor.isNativePlatform(),
    secureContext: globalThis.isSecureContext === true,
    worker: typeof Worker !== "undefined",
    webCodecs: typeof VideoDecoder !== "undefined",
    imageBitmap: typeof createImageBitmap !== "undefined",
    offscreenCanvas: typeof OffscreenCanvas !== "undefined",
    webCamera: typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
    nativeRunning: nativeRunningAvailable(),
    hardwareAcceptance: "not-performed-by-code",
    nativeRuntime: null as Record<string, unknown> | null,
  };
  if (nativeRunningAvailable()) probe.nativeRuntime = await nativeRecorder.diagnostics();
  return probe;
}
