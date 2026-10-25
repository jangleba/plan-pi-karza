import type { DetectedPose } from "./pose";
import { awaitLabTask, LabWorkerUnavailableError } from "./asyncTask";
export type { DetectedPose } from "./pose";

/** One worker per analysis owns its WASM task and is released after cancellation. */
export function createPoseDetector(signal: AbortSignal) {
  let worker: Worker | null = null;
  let fallback =
    typeof Worker === "undefined" ||
    typeof createImageBitmap === "undefined" ||
    typeof OffscreenCanvas === "undefined";
  const lifetime = new AbortController();
  let disposed = false;
  const stopWorker = () => {
    worker?.terminate();
    worker = null;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    lifetime.abort();
    signal.removeEventListener("abort", dispose);
    stopWorker();
  };
  signal.addEventListener("abort", dispose, { once: true });
  if (signal.aborted) dispose();
  return {
    dispose,
    async detect(canvas: HTMLCanvasElement): Promise<DetectedPose | null> {
      signal.throwIfAborted();
      lifetime.signal.throwIfAborted();
      if (!fallback) {
        let image: ImageBitmap | null = null;
        try {
          // Construction and bitmap creation can fail even when WKWebView exposes the APIs.
          try {
            worker ??= new Worker(new URL("./poseWorker.ts", import.meta.url), { type: "module" });
            image = await awaitLabTask(
              createImageBitmap(canvas),
              lifetime.signal,
              20_000,
              "Przygotowanie klatki trwa za długo.",
              (late) => late.close(),
            );
          } catch (error) {
            if (error instanceof DOMException && error.name === "TimeoutError") throw error;
            signal.throwIfAborted();
            lifetime.signal.throwIfAborted();
            throw new LabWorkerUnavailableError("Analiza w tle jest niedostępna.");
          }
          const current = worker!;
          const transferredImage = image;
          const task = new Promise<DetectedPose | null>((resolve, reject) => {
            current.onerror = () =>
              reject(new LabWorkerUnavailableError("Analiza w tle jest niedostępna."));
            current.onmessageerror = () =>
              reject(new LabWorkerUnavailableError("Nie można odebrać analizy w tle."));
            current.onmessage = (
              event: MessageEvent<{ pose?: DetectedPose | null; error?: string }>,
            ) => {
              // A worker may load successfully but fail to initialize WASM on this platform.
              if (event.data.error) reject(new LabWorkerUnavailableError(event.data.error));
              else resolve(event.data.pose ?? null);
            };
            try {
              current.postMessage(transferredImage, [transferredImage]);
            } catch {
              reject(new LabWorkerUnavailableError("Nie można przesłać klatki do analizy."));
            }
          });
          return await awaitLabTask(task, lifetime.signal, 20_000, "Analiza klatki trwa za długo.");
        } catch (error) {
          stopWorker();
          signal.throwIfAborted();
          lifetime.signal.throwIfAborted();
          if (!(error instanceof LabWorkerUnavailableError)) throw error;
          // Try the compatible main-thread task once. A timeout is never retried here.
          fallback = true;
        } finally {
          image?.close();
          if (worker) {
            worker.onmessage = null;
            worker.onerror = null;
            worker.onmessageerror = null;
          }
        }
      }
      signal.throwIfAborted();
      lifetime.signal.throwIfAborted();
      return awaitLabTask(
        import("./pose").then(({ detectPose }) => {
          signal.throwIfAborted();
          lifetime.signal.throwIfAborted();
          return detectPose(canvas);
        }),
        lifetime.signal,
        20_000,
        "Analiza sylwetki trwa za długo. Spróbuj ponownie przy dobrym połączeniu.",
      );
    },
  };
}
