// Zadanie „discover”: nowe ogłoszenia (monitorowane źródła + wyszukiwanie). Wywoływane z pg_cron co 12 h (patrz migracja 0003).
import { handler } from "../_shared/radar/edge.ts";

Deno.serve(handler("discover"));
