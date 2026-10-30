/** Idle, serial code loading: never start another import while the user has pending input. */
export function scheduleRouteWarmup<T>(
  targets: T[],
  preload: (target: T) => Promise<unknown>,
): () => void {
  if (typeof window === "undefined" || targets.length === 0) return () => {};
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
  let cancelled = false,
    index = 0,
    idle: number | undefined;
  let timer: number | undefined;
  const schedule = (delay: number) => {
    if (cancelled || index >= targets.length) return;
    timer = window.setTimeout(() => {
      if (window.requestIdleCallback) idle = window.requestIdleCallback(warm, { timeout: 1500 });
      else warm();
    }, delay);
  };
  const warm = () => {
    if (cancelled || !permitted() || document.visibilityState === "hidden") return;
    const scheduling = (
      navigator as Navigator & { scheduling?: { isInputPending?: () => boolean } }
    ).scheduling;
    if (scheduling?.isInputPending?.()) {
      schedule(200);
      return;
    }
    void Promise.resolve()
      .then(() => (cancelled ? undefined : preload(targets[index++])))
      .catch(() => undefined)
      .finally(() => schedule(200));
  };
  schedule(700);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback?.(idle);
  };
}

/** Retained for callers that only need the Start/Plan companion. */
export function scheduleCommonRouteWarmup(
  pathname: string,
  preload: (to: "/start" | "/plan") => Promise<unknown>,
): () => void {
  const target = pathname === "/start" ? "/plan" : pathname === "/plan" ? "/start" : null;
  return scheduleRouteWarmup(target ? [target] : [], preload);
}
