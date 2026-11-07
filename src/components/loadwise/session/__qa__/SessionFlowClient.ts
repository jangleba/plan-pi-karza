/* eslint-disable @typescript-eslint/no-explicit-any */
/** Inert, isolated QA database. Never addresses the production Supabase project. */
const key = "session66:qa-rows";
const read = () => JSON.parse(localStorage.getItem(key) || "[]");
function from(table: string) {
  const filters: ((r: any) => boolean)[] = [];
  let maximum = 500;
  const chain: any = {
    select: () => chain,
    eq: (k: string, v: any) => {
      filters.push((r) => r[k] === v);
      return chain;
    },
    in: (k: string, v: any[]) => {
      filters.push((r) => v.includes(r[k]));
      return chain;
    },
    like: (k: string, v: string) => {
      filters.push((r) => String(r[k]).startsWith(v.replace("%", "")));
      return chain;
    },
    order: () => chain,
    limit: (n: number) => {
      maximum = n;
      return chain;
    },
    then: (yes: any, no: any) =>
      Promise.resolve({
        data:
          table === "exercise_set_logs"
            ? read()
                .filter((r: any) => filters.every((f) => f(r)))
                .slice(0, maximum)
            : [],
        error: null,
      }).then(yes, no),
  };
  return chain;
}
const receipts = new Map();
export const supabase = {
  from,
  rpc: async (_name: string, args: any) => {
    if (receipts.has(args.p_operation_id))
      return { data: receipts.get(args.p_operation_id), error: null };
    const p = args.p_payload,
      rows = read(),
      old = rows.find(
        (r: any) =>
          r.user_id === p.user_id &&
          r.session_id === p.session_id &&
          r.exercise_key === p.exercise_key &&
          r.set_number === p.set_number,
      );
    if ((old?.write_version ?? 0) !== args.p_expected_version)
      return { data: null, error: { code: "40001", message: "Changed" } };
    const row = {
      ...p,
      id: old?.id ?? crypto.randomUUID(),
      write_version: (old?.write_version ?? 0) + 1,
    };
    localStorage.setItem(key, JSON.stringify([...rows.filter((r: any) => r !== old), row]));
    receipts.set(args.p_operation_id, row);
    return { data: row, error: null };
  },
};
