import type { Issue, LimitationCause } from "./engineV2/model";

/**
 * Plan limitations grouped by their structural cause: one short explanation, the sessions or
 * days it touches and the right action, instead of the same technical sentence repeated.
 */
export type IssueGroupKey = LimitationCause | "other";

export interface IssueGroup {
  key: IssueGroupKey;
  title: string;
  explanation: string;
  action: string;
  /** Distinct affected days (yyyy-MM-dd), oldest first. */
  dates: string[];
  /** Distinct affected targets (Siła A, Sprint …). */
  targets: string[];
  /** The generator's own sentences, for the details disclosure. */
  messages: string[];
  count: number;
}

const ORDER: IssueGroupKey[] = ["calendar", "time", "equipment", "preparation", "recipe", "other"];
const COPY: Record<IssueGroupKey, Pick<IssueGroup, "title" | "explanation" | "action">> = {
  calendar: {
    title: "Brak miejsca w kalendarzu",
    explanation:
      "Mecze, treningi klubowe, dni niedostępne lub rezerwa odpoczynku zajmują terminy tych sesji.",
    action:
      "Dodaj dostępny dzień albo zmniejsz liczbę wymaganych pełnych dni odpoczynku w ustawieniach planu.",
  },
  time: {
    title: "Za mało czasu w sesji",
    explanation: "Sesja nie mieści się w czasie na jednostkę, nawet w krótszym wariancie.",
    action: "Zwiększ czas na jednostkę w sekcji Dopasowanie treningu i sprawdź podgląd.",
  },
  equipment: {
    title: "Brak sprzętu lub miejsca",
    explanation:
      "Receptura wymaga sprzętu albo miejsca (np. prostej do sprintu), których nie zadeklarowano.",
    action:
      "Zaznacz sprzęt i miejsca, które faktycznie masz. Nie zastępujemy brakującego ćwiczenia ruchem z masą ciała.",
  },
  preparation: {
    title: "Przygotowanie niepotwierdzone",
    explanation:
      "Te ćwiczenia wymagają przygotowania, nadzoru lub kontroli ruchu, których profil jeszcze nie potwierdza. Sesja zachowuje pracę wspierającą.",
    action:
      "Nic nie musisz zmieniać: pełne ćwiczenia pojawią się po potwierdzonym przygotowaniu. Deklaracji nie podnosimy, żeby je odblokować.",
  },
  recipe: {
    title: "Brak zatwierdzonej receptury",
    explanation: "Dla tego celu nie ma zatwierdzonego ćwiczenia lub wariantu przy Twoim profilu.",
    action: "Po Twojej stronie nie ma działania. Ten cel pozostaje niepokryty w tym planie.",
  },
  other: {
    title: "Pozostałe uwagi",
    explanation: "Informacje o planie, które nie wynikają z jednej przyczyny.",
    action: "Przeczytaj szczegóły poniżej.",
  },
};
const TARGET_NAME: Record<string, string> = {
  strengthA: "Siła A",
  strengthB: "Siła B",
  speed: "Sprint",
  endurance: "Wydolność",
  mobility: "Mobilność",
};

export function groupPlanIssues(issues: readonly Issue[]): IssueGroup[] {
  const groups = new Map<IssueGroupKey, IssueGroup>();
  const seen = new Set<string>();
  for (const issue of issues) {
    const key: IssueGroupKey = issue.cause ?? "other";
    const dedupe = `${key}|${issue.date ?? ""}|${issue.target ?? ""}|${issue.message}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const group = groups.get(key) ?? {
      key,
      ...COPY[key],
      dates: [],
      targets: [],
      messages: [],
      count: 0,
    };
    group.count += 1;
    if (issue.date && !group.dates.includes(issue.date)) group.dates.push(issue.date);
    const target = issue.target ? TARGET_NAME[issue.target] : undefined;
    if (target && !group.targets.includes(target)) group.targets.push(target);
    if (!group.messages.includes(issue.message)) group.messages.push(issue.message);
    groups.set(key, group);
  }
  return ORDER.flatMap((key) => {
    const group = groups.get(key);
    return group ? [{ ...group, dates: [...group.dates].sort() }] : [];
  });
}
