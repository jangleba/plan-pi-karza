/** Isolated browser test backend. Never connects to a real account. */
const mode = new URLSearchParams(location.search).get("mode") ?? "success";
export const stats = { consentCalls: 0, saveCalls: 0, planPayloads: [] as unknown[] };
let savedAt: string | null = null;
function response(data: unknown, error: unknown = null) {
  return { data, error };
}
function request(work: () => ReturnType<typeof response>, stall = false) {
  let rejectTask: (error: unknown) => void = () => {};
  const timer = stall ? undefined : window.setTimeout(() => resolveTask(work()), 60);
  let resolveTask: (value: ReturnType<typeof response>) => void = () => {};
  const promise = new Promise<ReturnType<typeof response>>((resolve, reject) => {
    resolveTask = resolve;
    rejectTask = reject;
  });
  return Object.assign(promise, {
    retry: () => promise,
    abortSignal: (signal: AbortSignal) => {
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          rejectTask(new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );
      return promise;
    },
  });
}
export const supabase = {
  rpc(name: string, args: Record<string, unknown>) {
    if (name.startsWith("record_consent")) {
      stats.consentCalls++;
      return request(() => response({ updated_at: "2026-11-04T15:00:00Z" }));
    }
    if (name !== "save_profile_and_plan") throw new Error("Unexpected RPC: " + name);
    stats.saveCalls++;
    stats.planPayloads.push(args.p_plan ?? null);
    return request(() => {
      if (mode === "fail_once" && stats.saveCalls === 1)
        return response(null, { message: "upstream request timeout" });
      savedAt = "2026-11-04T15:00:01Z";
      if (mode === "lost_response") return response(null, { message: "upstream request timeout" });
      return response({ athlete: { updated_at: "2026-11-04T15:00:01Z" } });
    }, mode === "hung");
  },
  from() {
    const query = {
      select: () => query,
      eq: () => query,
      // The profile row exists only after a save has landed.
      maybeSingle: () => request(() => response(savedAt ? { updated_at: savedAt } : null)),
    };
    return query;
  },
};
Object.assign(window, { __onboardingQA: stats });
