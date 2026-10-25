/** Bounds asynchronous browser/WASM operations and releases values arriving after cancellation. */
export function awaitLabTask<T>(
  task: Promise<T>,
  signal: AbortSignal,
  timeoutMs: number,
  timeoutMessage: string,
  releaseLateValue?: (value: T) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const clean = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    };
    const fail = (reason: unknown) => {
      if (settled) return;
      settled = true;
      clean();
      reject(reason);
    };
    const abort = () => fail(signal.reason ?? new DOMException("Anulowano", "AbortError"));
    const timer = setTimeout(
      () => fail(new DOMException(timeoutMessage, "TimeoutError")),
      timeoutMs,
    );
    signal.addEventListener("abort", abort, { once: true });
    task.then((value) => {
      if (settled) {
        releaseLateValue?.(value);
        return;
      }
      settled = true;
      clean();
      resolve(value);
    }, fail);
    if (signal.aborted) abort();
  });
}

export class LabWorkerUnavailableError extends Error {}
