type LovableErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type LovableEvents = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: LovableErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    __lovableEvents?: LovableEvents;
  }
}

export function reportLovableError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  if (import.meta.env.VITE_ENABLE_DIAGNOSTICS !== "true") return;

  // Never forward the original message, stack or caller context. They can
  // contain free text, health information, e-mail addresses or database values.
  const safeError = new Error("BallWise client error");
  safeError.name = error instanceof Error ? error.name.slice(0, 80) : "UnknownError";
  const component = typeof context.component === "string" ? context.component.slice(0, 80) : undefined;

  window.__lovableEvents?.captureException?.(
    safeError,
    {
      source: "react_error_boundary",
      route: window.location.pathname,
      ...(component ? { component } : {}),
    },
    {
      mechanism: "react_error_boundary",
      handled: false,
      severity: "error",
    },
  );
}
