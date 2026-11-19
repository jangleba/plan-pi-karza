import { createFileRoute } from "@tanstack/react-router";
import { fetchOffFoods } from "../lib/off";

/** Pośrednik do Open Food Facts (przeglądarka nie może pytać tej bazy bezpośrednio – brak CORS). */
export const Route = createFileRoute("/api/foods")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const q = new URL(request.url).searchParams.get("q") ?? "";
        if (q.trim().length < 2) return Response.json({ foods: [] });
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 7000);
        try {
          const foods = await fetchOffFoods(q, ctl.signal);
          return Response.json({ foods }, { headers: { "Cache-Control": "public, max-age=3600" } });
        } catch {
          return Response.json({ foods: [], error: "unavailable" }, { status: 502 });
        } finally {
          clearTimeout(timer);
        }
      },
    },
  },
});
