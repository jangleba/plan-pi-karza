/** Bound network waits, including clients that do not settle promptly after abort. */
export async function fuelRequest<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) throw new DOMException("Anulowano", "AbortError");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    cancel = () => {
      reject(new DOMException("Anulowano", "AbortError"));
      controller.abort();
    };
    signal?.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(controller.signal), interrupted]);
  } finally {
    clearTimeout(timer);
    if (cancel) signal?.removeEventListener("abort", cancel);
  }
}
