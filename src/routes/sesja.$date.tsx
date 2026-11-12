import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useInstantBack } from "@/lib/loadwise/uiHooks";
import { SessionDetailView } from "@/components/loadwise/session/SessionDetailView";

const searchSchema = (search: Record<string, unknown>): { slot: 1 | 2; mod?: string } => ({
  slot: Number(search.slot) === 2 ? 2 : 1,
  mod: typeof search.mod === "string" && search.mod ? search.mod : undefined,
});

export const Route = createFileRoute("/sesja/$date")({
  validateSearch: searchSchema,
  component: SessionDetail,
});

/** Deep links (history, progress, notifications) open the session as a full page. */
function SessionDetail() {
  const { date } = Route.useParams();
  const { slot, mod } = Route.useSearch();
  const router = useRouter();
  const goBack = useInstantBack("/plan");
  return (
    <SessionDetailView
      date={date}
      slot={slot}
      mod={mod}
      onBack={goBack}
      onSelect={(target) =>
        router.navigate({
          to: "/sesja/$date",
          params: { date: target.date },
          search: { slot: target.slot, mod: target.mod },
        })
      }
    />
  );
}
