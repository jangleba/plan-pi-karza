import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/loadwise/auth";

/**
 * Prywatny dziennik kariery — wyłącznie lokalny, per użytkownik.
 * Brak publicznego profilu i brak udostępniania danych innym użytkownikom.
 */
export interface CareerEntry {
  id: string;
  club: string;
  date: string; // yyyy-MM-dd
  stage: string;
  outcome: string;
  nextStep: string;
  createdAt: string;
}

function key(userId: string) {
  return `ballwise:career:v1:${userId}`;
}

function read(userId: string): CareerEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CareerEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(userId: string, entries: CareerEntry[]) {
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(entries));
  } catch {
    /* ignore */
  }
}

export function useCareerJournal() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<CareerEntry[]>([]);

  useEffect(() => {
    if (!user) {
      setEntries([]);
      return;
    }
    setEntries(read(user.id));
  }, [user]);

  const addEntry = useCallback(
    (input: Omit<CareerEntry, "id" | "createdAt">) => {
      if (!user) return;
      const entry: CareerEntry = {
        ...input,
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : String(Date.now()),
        createdAt: new Date().toISOString(),
      };
      setEntries((prev) => {
        const next = [entry, ...prev].sort((a, b) => (a.date < b.date ? 1 : -1));
        write(user.id, next);
        return next;
      });
    },
    [user],
  );

  const removeEntry = useCallback(
    (id: string) => {
      if (!user) return;
      setEntries((prev) => {
        const next = prev.filter((e) => e.id !== id);
        write(user.id, next);
        return next;
      });
    },
    [user],
  );

  return { entries, addEntry, removeEntry };
}
