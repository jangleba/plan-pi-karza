/** Isolated browser test backend. Never connects to a real account. */
const mode = new URLSearchParams(location.search).get("mode") ?? "success";
export const stats = { consentCalls: 0, saveCalls: 0, generations: 0, planIds: [] as string[] };
let persistedPlanId: string | null = null;
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
    const plan = args.p_plan as Record<string, unknown>;
    const id = String(plan.p_plan_id);
    stats.saveCalls++;
    stats.planIds.push(id);
    return request(() => {
      if (mode === "fail_once" && stats.saveCalls === 1)
        return response(null, { message: "upstream request timeout" });
      persistedPlanId = id;
      if (mode === "lost_response") return response(null, { message: "upstream request timeout" });
      return response({ athlete: { updated_at: "2026-11-04T15:00:01Z" } });
    }, mode === "hung");
  },
  from(table: string) {
    const filters: Record<string, unknown> = {};
    const query = {
      select: () => query,
      eq: (k: string, v: unknown) => {
        filters[k] = v;
        return query;
      },
      maybeSingle: () =>
        request(() =>
          response(
            table === "training_plans"
              ? persistedPlanId && filters.id === persistedPlanId
                ? { id: persistedPlanId }
                : null
              : { updated_at: "2026-11-04T15:00:01Z" },
          ),
        ),
    };
    return query;
  },
};
Object.assign(window, { __onboardingQA: stats });
