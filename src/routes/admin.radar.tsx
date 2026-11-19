import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { RadarAdmin } from "../radar/Admin";

// Panel administratora radaru „Piłkarskie szanse”. Dostęp egzekwuje serwer (RLS i rola w funkcjach), nie ten adres.
export const Route = createFileRoute("/admin/radar")({
  component: () => (
    <ClientOnly fallback={null}>
      <RadarAdmin />
    </ClientOnly>
  ),
});
