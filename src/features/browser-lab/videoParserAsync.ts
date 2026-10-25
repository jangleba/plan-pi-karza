import type { JumpVideo } from "./videoParser";
import { awaitLabTask, LabWorkerUnavailableError } from "./asyncTask";

export async function parseJumpVideoAsync(
  buffer: ArrayBuffer,
  signal: AbortSignal,
): Promise<JumpVideo> {
  signal.throwIfAborted();
  if (typeof Worker !== "undefined") {
    let worker: Worker | null = null;
    try {
      try {
        worker = new Worker(new URL("./videoParserWorker.ts", import.meta.url), { type: "module" });
      } catch {
        throw new LabWorkerUnavailableError("Odczyt filmu w tle jest niedostępny.");
      }
      const current = worker;
      const task = new Promise<JumpVideo>((resolve, reject) => {
        current.onerror = () =>
          reject(new LabWorkerUnavailableError("Nie można uruchomić odczytu filmu w tle."));
        current.onmessageerror = () =>
          reject(new LabWorkerUnavailableError("Nie można odebrać filmu z odczytu w tle."));
        current.onmessage = (event: MessageEvent<{ video?: JumpVideo; error?: string }>) => {
          // A parsed-file error is a real input error and must not run the parser twice.
          if (event.data.error || !event.data.video)
            reject(new Error(event.data.error ?? "Nieprawidłowy film."));
          else resolve(event.data.video);
        };
        try {
          // Keep the original intact for a single compatibility fallback if worker startup fails.
          current.postMessage(buffer);
        } catch {
          reject(new LabWorkerUnavailableError("Nie można przekazać filmu do odczytu w tle."));
        }
      });
      return await awaitLabTask(
        task,
        signal,
        20_000,
        "Odczyt filmu trwa za długo. Wybierz krótszy klip.",
      );
    } catch (error) {
      signal.throwIfAborted();
      if (!(error instanceof LabWorkerUnavailableError)) throw error;
    } finally {
      worker?.terminate();
    }
  }
  signal.throwIfAborted();
  const { parseJumpVideo } = await import("./videoParser");
  signal.throwIfAborted();
  const video = parseJumpVideo(buffer);
  signal.throwIfAborted();
  return video;
}
