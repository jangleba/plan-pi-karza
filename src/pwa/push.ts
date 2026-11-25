import { supabase } from "../lib/supabase";
import { isStandalone } from "./register";
import { isIOS } from "./platform";

/**
 * Powiadomienia (Web Push) za zgodą: wiadomość trenera, zmiana planu, przypomnienie.
 * – iPhone/iPad: tylko z ikony na ekranie początkowym (iOS 16.4+), a prośba o zgodę musi wyjść z dotknięcia przycisku.
 * – Klucz publiczny VAPID w VITE_VAPID_PUBLIC_KEY; prywatny wyłącznie w sekretach funkcji `send-push`.
 */
const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushState = "unsupported" | "needs-install" | "unconfigured" | "denied" | "off" | "on";

export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return isIOS(navigator.userAgent, navigator.maxTouchPoints) && !isStandalone() ? "needs-install" : "unsupported";
  }
  if (isIOS(navigator.userAgent, navigator.maxTouchPoints) && !isStandalone()) return "needs-install";
  if (!VAPID || !supabase) return "unconfigured";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function keyBytes(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
const b64url = (buf: ArrayBuffer | null) => (buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : "");

/** Wywoływać WYŁĄCZNIE z obsługi dotknięcia (wymóg Safari). */
export async function enablePush(topics: Array<"message" | "plan_change" | "reminder"> = ["message", "plan_change", "reminder"], reminderHour: number | null = null): Promise<PushState> {
  if (!VAPID || !supabase) return "unconfigured";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "denied" : "off";
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) as BufferSource }));
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: sub.endpoint, p_p256dh: b64url(sub.getKey("p256dh")), p_auth: b64url(sub.getKey("auth")), p_topics: topics, p_reminder_hour: reminderHour,
  });
  return error ? "off" : "on";
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  if (supabase) await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint).then(() => undefined, () => undefined);
  await sub.unsubscribe().catch(() => undefined);
}
