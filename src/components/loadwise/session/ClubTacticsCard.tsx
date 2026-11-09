import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { clubTacticalCues } from "@/features/football-iq-match/clubTactics";
import { loadFieldTask } from "@/features/football-iq-match/fieldTask";
import type { Level, Position } from "@/lib/loadwise/types";

/** Football IQ tasks to apply in today's club training. Only what to do. */
export function ClubTacticsCard({
  ownerId,
  position,
  level,
  date,
}: {
  ownerId?: string;
  position: Position;
  level: Level;
  date: string;
}) {
  const [recentTopic, setRecentTopic] = useState<string | null>(null);
  useEffect(() => {
    // Read after mount: storage is browser-only.
    setRecentTopic(loadFieldTask(ownerId)?.topicId ?? null);
  }, [ownerId]);
  const cues = useMemo(
    () => clubTacticalCues({ position, level, date, recentIqTopicId: recentTopic }),
    [position, level, date, recentTopic],
  );
  if (!cues.length) return null;
  return (
    <section className="soft-card space-y-3 px-4 py-4" aria-labelledby="club-tactics-title">
      <h2 id="club-tactics-title" className="text-sm font-bold text-foreground">
        Zadania taktyczne na trening
      </h2>
      <ol className="space-y-3">
        {cues.map((cue, i) => (
          <li key={cue.topic} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-foreground">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {cue.label}
              </p>
              <p className="mt-0.5 text-sm leading-snug text-foreground">{cue.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <Link
        to="/football-iq"
        className="flex items-center justify-between gap-2 text-sm font-semibold text-primary"
      >
        Przećwicz w Football IQ
        <ArrowRight className="h-4 w-4 shrink-0" />
      </Link>
    </section>
  );
}
