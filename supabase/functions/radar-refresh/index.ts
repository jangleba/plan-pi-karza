// Zadanie „refresh”: ponowne sprawdzenie aktywnych ofert. Wywoływane z pg_cron co 6 h (patrz migracja 0003).
import { handler } from "../_shared/radar/edge.ts";

Deno.serve(handler("refresh"));
