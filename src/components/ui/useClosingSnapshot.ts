import { useEffect, useRef, useState } from "react";

/** Keep exiting content until its sheet has left, including rapid close/reopen. */
export function useClosingSnapshot<T>(value: T, active: boolean) {
  const last = useRef(value),
    [present, setPresent] = useState(active);
  if (active) last.current = value;
  useEffect(() => {
    if (active) {
      setPresent(true);
      return;
    }
    if (!present) return;
    const timer = window.setTimeout(() => setPresent(false), 550);
    return () => window.clearTimeout(timer);
  }, [active, present]);
  return { value: active ? value : last.current, present: active || present };
}
