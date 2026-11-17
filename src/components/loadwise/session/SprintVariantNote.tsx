import type { SessionDay } from "@/lib/loadwise/types";

/**
 * Why the session is not the sprint task the player or the cycle asked for (or why a jump block
 * was left out): the cause recorded by the generator, never a silent swap.
 */
export function SprintVariantNote({ session }: { session: SessionDay }) {
  const variant = session.engineV2?.sprintVariant;
  if (!variant) return null;
  const notes = [
    variant.goalChange?.reason,
    ...variant.why.filter((reason) => /pominięte/.test(reason)),
  ].filter((note): note is string => Boolean(note));
  if (!notes.length) return null;
  return (
    <section className="bw-session-notice" aria-label="Dobór sprintu" role="note">
      <strong>Dobór sprintu</strong>
      <ul>
        {notes.map((note) => (
          <li key={note}>{note.charAt(0).toLocaleUpperCase("pl-PL") + note.slice(1)}</li>
        ))}
      </ul>
    </section>
  );
}
