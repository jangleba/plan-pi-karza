/** Warm one common destination after the current screen has had time to paint. */
export function scheduleCommonRouteWarmup(
  pathname: string,
  preload: (to: "/start" | "/plan") => Promise<unknown>,
): () => void {
  if (typeof window === "undefined") return () => {};
  const permitted = () => {
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string; downlink?: number };
      }
    ).connection;
    return (
      navigator.onLine !== false &&
      !connection?.saveData &&
      !/^(slow-2g|2g|3g)$/.test(connection?.effectiveType ?? "") &&
      !(connection?.downlink !== undefined && connection.downlink < 1)
    );
  };
  if (!permitted()) return () => {};
  const target = pathname === "/start" ? "/plan" : pathname === "/plan" ? "/start" : null;
  if (!target) return () => {};
  let cancelled = false;
  let idle: number | undefined;
  const warm = () => {
    if (!cancelled && permitted() && document.visibilityState !== "hidden")
      void preload(target).catch(() => undefined); // A normal tap retries a failed preload.
  };
  const timer = window.setTimeout(() => {
    if (window.requestIdleCallback) idle = window.requestIdleCallback(warm, { timeout: 1500 });
    else warm();
  }, 700);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback?.(idle);
  };
}
