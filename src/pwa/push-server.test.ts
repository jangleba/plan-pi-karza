import { describe, expect, it } from "vitest";
import { notifyPlayer, parseWebhook, payloadFor, sameSecret, type Subscription } from "../../supabase/functions/_shared/push";

const msg = { id: "m1", player_id: "p1", coach_id: "c1", kind: "message" as const, body: "Dobra robota.\n\nJutro lżej." };
const sub = (endpoint: string, topics = ["message", "plan_change", "reminder"]): Subscription => ({ endpoint, p256dh: "k", auth: "a", topics });

describe("powiadomienia z wiadomości trenera (funkcja send-push)", () => {
  it("treść: tytuł zależny od rodzaju, skrócony tekst, kliknięcie otwiera wiadomość", () => {
    expect(payloadFor(msg)).toMatchObject({ title: "Wiadomość od trenera", body: "Dobra robota. Jutro lżej.", open: "message", id: "m1" });
    expect(payloadFor({ ...msg, kind: "plan_change", body: "x".repeat(300) }).body).toHaveLength(138);
  });
  it("wysyła tylko na urządzenia z tym tematem, usuwa wygasłe subskrypcje (410/404)", async () => {
    const removed: string[] = [];
    const out = await notifyPlayer(msg, {
      subscriptions: async () => [sub("https://a"), sub("https://gone"), sub("https://quiet", ["reminder"]), sub("https://err")],
      send: async (s) => ({ status: s.endpoint === "https://gone" ? 410 : s.endpoint === "https://err" ? 500 : 201 }),
      remove: async (e) => { removed.push(e); },
    });
    expect(out).toEqual({ sent: 1, removed: 1, failed: 1 });
    expect(removed).toEqual(["https://gone"]);
  });
  it("webhook: tylko INSERT do coach_messages; sekret porównywany w całości", () => {
    expect(parseWebhook({ type: "INSERT", table: "coach_messages", record: msg })).toMatchObject({ id: "m1" });
    expect(parseWebhook({ type: "UPDATE", table: "coach_messages", record: msg })).toBeNull();
    expect(parseWebhook({ type: "INSERT", table: "profiles", record: msg })).toBeNull();
    expect(sameSecret("abc", "abc")).toBe(true);
    expect(sameSecret("abd", "abc")).toBe(false);
    expect(sameSecret(null, "abc")).toBe(false);
  });
});
