// BallWise-maintained adapter. Keep previewAuthStorage.test.ts when updating the Lovable integration.

/** Storage accepted by Supabase's auth.storage option. */
export interface PreviewAuthStorage {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
}

type BrokerRequestType =
  "lovable-preview-auth:get" | "lovable-preview-auth:set" | "lovable-preview-auth:remove";
interface BrokerReply {
  ok: boolean;
  value: string | null;
}

function readBrokerReply(data: unknown, requestId: string): BrokerReply | null {
  if (typeof data !== "object" || data === null) return null;
  if (!("type" in data) || data.type !== "lovable-preview-auth:result") return null;
  if (!("requestId" in data) || data.requestId !== requestId) return null;
  return {
    ok: "ok" in data && data.ok === true,
    value: "value" in data && typeof data.value === "string" ? data.value : null,
  };
}

/**
 * Share sessions with the trusted editor when it answers. A missing editor is
 * probed once; ordinary SDK storage reads must not each wait for its timeout.
 * Safari can deny even the localStorage getter, so all local access is guarded.
 */
export function brokeredPreviewStorage(): PreviewAuthStorage | undefined {
  if (typeof window === "undefined") return undefined;
  const memory = new Map<string, string>();
  const volatile = new Set<string>();
  const versions = new Map<string, number>();
  const version = (key: string) => versions.get(key) ?? 0;
  const changed = (key: string) => versions.set(key, version(key) + 1);
  const readLocal = (key: string): string | null => {
    if (volatile.has(key)) {
      // A blocked/full store can still contain an older session. Flush the
      // pending value (including a logout tombstone) before trusting it again.
      try {
        const value = memory.get(key);
        if (value === undefined) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, value);
        volatile.delete(key);
      } catch {
        return memory.get(key) ?? null;
      }
    }
    try {
      const value = window.localStorage.getItem(key);
      if (value !== null) {
        memory.set(key, value);
        volatile.delete(key);
        return value;
      }
      // A failed write exists only in this page; a successful write removed in
      // another tab must stay removed instead of reviving the memory copy.
      if (!volatile.has(key)) memory.delete(key);
    } catch {
      /* A blocked browser store uses the in-memory session for this page. */
    }
    return memory.get(key) ?? null;
  };
  const writeLocal = (key: string, value: string | null) => {
    changed(key);
    if (value === null) memory.delete(key);
    else memory.set(key, value);
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
      volatile.delete(key);
    } catch {
      volatile.add(key);
    }
  };
  const localStorageAdapter: PreviewAuthStorage = {
    getItem: readLocal,
    setItem: (key, value) => writeLocal(key, value),
    removeItem: (key) => writeLocal(key, null),
  };

  const host = location.hostname;
  const previewZones = [
    "lovableproject.com",
    "lovableproject-dev.com",
    "lovable.app",
    "gpt-eng.com",
    "gptengineer.run",
  ];
  const onPreviewZone = previewZones.some((zone) => host === zone || host.endsWith("." + zone));
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
  const projectId = onPreviewZone
    ? (new RegExp(
        "^(?:id-preview(?:-[a-z0-9]+)?|project)--(" + uuid + ")(?:-dev)?(?=\\.|$)",
        "i",
      ).exec(host)?.[1] ?? new RegExp("^(" + uuid + ")(?=[.-])", "i").exec(host)?.[1])
    : undefined;
  const parentWindow = window.parent as Window | null;
  if (!projectId || !parentWindow || parentWindow === window) return localStorageAdapter;

  const dev = host.endsWith(".lovableproject-dev.com") || host.endsWith(".gpt-eng.com");
  const editor = dev
    ? /^https:\/\/([a-z0-9-]+\.)*(lovable\.dev|gptengineer\.app)$|^http:\/\/localhost:3000$/
    : /^https:\/\/([a-z0-9-]+\.)*(lovable\.dev|gptengineer\.app)$/;
  let ancestor = location.ancestorOrigins?.[0] ?? "";
  if (!ancestor && document.referrer) {
    try {
      ancestor = new URL(document.referrer).origin;
    } catch {
      /* no trusted referrer */
    }
  }
  const origins =
    ancestor && editor.test(ancestor)
      ? [ancestor]
      : dev
        ? ["https://lovable.dev", "http://localhost:3000"]
        : ["https://lovable.dev"];
  let mode: "unknown" | "connected" | "unavailable" = "unknown";

  const request = (
    type: BrokerRequestType,
    key: string,
    value?: string,
  ): Promise<BrokerReply | null> =>
    new Promise((resolve) => {
      const requestId = crypto.randomUUID();
      let done = false;
      const finish = (reply: BrokerReply | null) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        resolve(reply);
      };
      const onMessage = (event: MessageEvent<unknown>) => {
        if (event.source !== parentWindow || !origins.includes(event.origin)) return;
        const reply = readBrokerReply(event.data, requestId);
        if (reply) finish(reply);
      };
      const timer = setTimeout(() => finish(null), 2000);
      window.addEventListener("message", onMessage);
      const message = {
        type,
        requestId,
        projectId,
        key,
        ...(value === undefined ? {} : { value }),
      };
      try {
        for (const origin of origins) parentWindow.postMessage(message, origin);
      } catch {
        finish(null);
      }
    });

  let initialRead: Promise<BrokerReply | null> | undefined;
  let initialKey: string | undefined;
  const initialHandshake = (key: string, local: string | null) => {
    if (!initialRead) {
      initialKey = key;
      initialRead = (async () => {
        let reply = await request("lovable-preview-auth:get", key, local ?? undefined);
        if (!reply) {
          await new Promise<void>((resolve) => setTimeout(resolve, 250));
          reply = await request("lovable-preview-auth:get", key, readLocal(key) ?? undefined);
        }
        mode = reply?.ok ? "connected" : "unavailable";
        return reply;
      })();
    }
    return initialRead;
  };

  return {
    getItem: async (key) => {
      const revision = version(key);
      const local = readLocal(key);
      if (mode === "unavailable") return local;
      let reply: BrokerReply | null;
      if (mode === "unknown") {
        reply = await initialHandshake(key, local);
        if (key !== initialKey && reply?.ok)
          reply = await request("lovable-preview-auth:get", key, local ?? undefined);
        else if (key !== initialKey) reply = null;
      } else {
        reply = await request("lovable-preview-auth:get", key, local ?? undefined);
        if (!reply) mode = "unavailable";
      }
      // An editor response cannot undo a newer sign-in, logout or another tab's change.
      if (revision !== version(key) || readLocal(key) !== local) return readLocal(key);
      if (reply?.ok && reply.value !== null) {
        const value = reply.value === "" ? null : reply.value;
        writeLocal(key, value);
        return value;
      }
      return readLocal(key);
    },
    setItem: async (key, value) => {
      writeLocal(key, value);
      if (mode === "unavailable") return;
      const revision = version(key);
      const reply = await request("lovable-preview-auth:set", key, value);
      if (!reply) mode = "unavailable";
      if (
        reply?.ok &&
        reply.value !== null &&
        revision === version(key) &&
        readLocal(key) === value
      )
        writeLocal(key, reply.value === "" ? null : reply.value);
    },
    removeItem: async (key) => {
      const local = readLocal(key);
      writeLocal(key, null);
      if (mode === "unavailable") return;
      const reply = await request("lovable-preview-auth:remove", key, local ?? undefined);
      if (!reply) mode = "unavailable";
    },
  };
}
