import { useEffect, useState, type ReactNode } from "react";

/** First open loads the panel; folding preserves drafts and a running rest. */
export function PersistentExercisePanel({
  open,
  id,
  children,
}: {
  open: boolean;
  id?: string;
  children: ReactNode;
}) {
  const [visited, setVisited] = useState(open);
  useEffect(() => {
    if (open) setVisited(true);
  }, [open]);
  if (!open && !visited) return null;
  return (
    <div id={id} hidden={!open} className="bw-exercise-panel">
      {children}
    </div>
  );
}
