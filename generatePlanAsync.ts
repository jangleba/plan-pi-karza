import type { Profile, SessionDay } from "./types";

/** Heavy generation never blocks the installed app's UI. SSR/tests use the same engine. */
export async function generatePlanAsync(
  profile: Profile,
  start: Date,
  days = 28,
  weekOffset = 0,
  signal?: AbortSignal,
): Promise<SessionDay[]> {
  signal?.throwIfAborted();
  if (typeof Worker === "undefined") {
    const { generatePlan } = await import("./planEngine");
    return generatePlan(profile, start, days, weekOffset);
  }
  const worker = new Worker(new URL("./planWorker.ts", import.meta.url), { type: "module" });
  return new Promise((resolve, reject) => {
    const close = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const fail = (error: unknown) => {
      close();
      reject(error);
    };
    const abort = () => fail(signal?.reason ?? new DOMException("Anulowano", "AbortError"));
    const timeout = setTimeout(
      () => fail(new Error("Układanie planu trwa za długo. Spróbuj ponownie.")),
      30_000,
    );
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = () =>
      fail(new Error("Nie udało się uruchomić układania planu. Spróbuj ponownie."));
    worker.onmessage = (event: MessageEvent<{ plan?: SessionDay[]; error?: string }>) => {
      if (event.data.error) {
        fail(new Error(event.data.error));
        return;
      }
      if (!Array.isArray(event.data.plan)) {
        fail(new Error("Nieprawidłowy wynik układania planu."));
        return;
      }
      close();
      resolve(event.data.plan);
    };
    worker.postMessage({ profile, start: start.toISOString(), days, weekOffset });
  });
}
