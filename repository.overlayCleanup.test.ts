import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearFutureOverlaysForUser } from "./repository";
const mock = vi.hoisted(() => ({
  rows: [] as { id: string; user_id: string; date: string; active: boolean }[],
  from: vi.fn(),
  selected: [] as string[],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      mock.from(table);
      let owner: string, fromDate: string, ids: string[] | undefined;
      const chain = {
        update: () => chain,
        eq: (key: string, value: string | boolean) => {
          if (key === "user_id") owner = String(value);
          return chain;
        },
        gte: (_key: string, value: string) => {
          fromDate = value;
          return chain;
        },
        in: (_key: string, value: string[]) => {
          ids = value;
          mock.selected = value;
          return chain;
        },
        then: (resolve: (result: { error: null }) => unknown) => {
          for (const row of mock.rows)
            if (
              row.user_id === owner &&
              row.date >= fromDate &&
              row.active &&
              (!ids || ids.includes(row.id))
            )
              row.active = false;
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
      return chain;
    },
  },
}));
beforeEach(() => {
  mock.rows = [
    { id: "known", user_id: "u", date: "2026-10-19", active: true },
    { id: "created-during-refresh", user_id: "u", date: "2026-10-19", active: true },
    { id: "other-owner", user_id: "v", date: "2026-10-19", active: true },
  ];
  mock.selected = [];
  mock.from.mockClear();
});
describe("background overlay cleanup", () => {
  it("deactivates only IDs captured before generation and preserves a newer decision", async () => {
    await clearFutureOverlaysForUser("u", "2026-10-19", false, ["known"]);
    expect(mock.selected).toEqual(["known"]);
    expect(mock.rows.map((row) => [row.id, row.active])).toEqual([
      ["known", false],
      ["created-during-refresh", true],
      ["other-owner", true],
    ]);
  });
  it("does not issue a destructive update for an empty captured snapshot", async () => {
    await clearFutureOverlaysForUser("u", "2026-10-19", false, []);
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.rows.every((row) => row.active)).toBe(true);
  });
});
