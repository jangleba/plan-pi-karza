import { describe, expect, it } from "vitest";
import {
  currentKilometer,
  distanceAt,
  pushSample,
  samplesFromRoute,
  stablePace,
  type DistanceSample,
} from "./liveMetrics";
import {
  HISTORY_LIMIT,
  historyEntryFromDraft,
  historyRoute,
  loadRunHistory,
  removeRunFromHistory,
  saveRunToHistory,
  thinRoute,
} from "./routeHistory";
import { nativeRoute, nativeRunDraft } from "./nativeRecorder";
import { buildIntervalResult, withMeasuredDistance } from "./intervals";
import { projectRoute, routeSegments } from "@/components/running/RunRouteMap";
import type { RoutePoint, RunningActivityDraft, RunningIntervalStep } from "./types";

/** Bieg po prostej na północ: `speed` m/s, punkt co sekundę. */
function straightRoute(seconds: number, speed = 3.33, segment = 0, from = 0): RoutePoint[] {
  const metersPerDegree = 111_195;
  return Array.from({ length: seconds + 1 }, (_, i) => ({
    lat: 52 + ((from + i) * speed) / metersPerDegree,
    lng: 21,
    recordedAt: new Date(Date.UTC(2026, 10, 12, 10, 0, from + i)).toISOString(),
    elapsedSec: from + i,
    accuracyM: 5,
    segment,
  }));
}

const steady = (seconds: number, speed: number): DistanceSample[] =>
  Array.from({ length: seconds + 1 }, (_, i) => ({ elapsedSec: i, distanceM: i * speed }));

describe("stabilne tempo i dystans w czasie", () => {
  it("tempo z okna 30 s nie skacze od pojedynczego błędnego punktu", () => {
    const samples = steady(120, 1000 / 300); // 5:00/km
    expect(stablePace(samples, 120)).toBeCloseTo(300, 0);
    // Jeden punkt 15 m do przodu (szum GPS) zmienia tempo o kilka %, nie o połowę.
    const noisy = samples.map((s, i) => (i === 119 ? { ...s, distanceM: s.distanceM + 15 } : s));
    const pace = stablePace(noisy, 120)!;
    expect(Math.abs(pace - 300) / 300).toBeLessThan(0.05);
  });

  it("na postoju, w marszu w miejscu albo bez sygnału nie pokazuje przypadkowego tempa", () => {
    expect(stablePace(steady(60, 0.2), 60)).toBeNull();
    expect(stablePace(steady(60, 3), 90)).toBeNull();
    expect(stablePace([{ elapsedSec: 0, distanceM: 0 }], 1)).toBeNull();
  });

  it("dystans w dowolnej sekundzie — granice kroków minięte przy zablokowanym ekranie", () => {
    const samples = [
      { elapsedSec: 0, distanceM: 0 },
      { elapsedSec: 100, distanceM: 400 },
      { elapsedSec: 200, distanceM: 500 },
    ];
    expect(distanceAt(samples, 50)).toBe(200);
    expect(distanceAt(samples, 150)).toBe(450);
    expect(distanceAt(samples, 999)).toBe(500);
    expect(distanceAt([], 10)).toBe(0);
  });

  it("próbki z trasy nie łączą segmentów po pauzie", () => {
    const route = [...straightRoute(10, 3, 0), ...straightRoute(10, 3, 1, 1000).slice(0)];
    const samples = samplesFromRoute(route);
    expect(samples.at(-1)!.distanceM).toBeCloseTo(60, 0);
  });

  it("pushSample odrzuca cofnięty czas i przycina okno", () => {
    let s: DistanceSample[] = [];
    s = pushSample(s, { elapsedSec: 0, distanceM: 0 });
    s = pushSample(s, { elapsedSec: 10, distanceM: 30 });
    s = pushSample(s, { elapsedSec: 5, distanceM: 10 });
    expect(s).toHaveLength(2);
    for (let i = 11; i <= 100; i += 1) s = pushSample(s, { elapsedSec: i, distanceM: i * 3 }, 30);
    expect(s[0].elapsedSec).toBeLessThanOrEqual(70);
    expect(s.length).toBeLessThan(40);
  });

  it("bieżący kilometr liczy czas od przejścia ostatniej pełnej granicy", () => {
    const samples = steady(400, 1000 / 300);
    const km = currentKilometer(samples, 400)!;
    expect(km.kilometer).toBe(2);
    expect(km.durationSec).toBeCloseTo(100, 0);
    expect(km.distanceM).toBeCloseTo(333.3, 0);
  });
});

describe("odcinki przeliczone z trasy", () => {
  const step: RunningIntervalStep = {
    id: "r:b0:s1:r1:work",
    kind: "work",
    label: "Bieg",
    instruction: "",
    repeatIndex: 1,
    repeatTotal: 4,
    phase: "main",
    target: { mode: "time", value: 180, label: "3:00", autoAdvance: true },
  };
  it("zachowuje czas kroku, poprawia dystans i tempo", () => {
    const rough = buildIntervalResult({
      step,
      durationSec: 180,
      distanceM: 0,
      completed: true,
      startElapsedSec: 600,
    });
    expect(rough.startElapsedSec).toBe(600);
    const exact = withMeasuredDistance(rough, 720);
    expect(exact.durationSec).toBe(180);
    expect(exact.paceSecPerKm).toBeCloseTo(250, 5);
  });
  it("krótkie odcinki nadal nie mają tempa", () => {
    const short = buildIntervalResult({
      step: { ...step, target: { ...step.target, value: 15 } },
      durationSec: 15,
      distanceM: 0,
      completed: true,
    });
    expect(withMeasuredDistance(short, 80).paceSecPerKm).toBeNull();
  });
});

describe("trasa z natywnego rejestratora", () => {
  it("odczytuje punkty, odrzuca uszkodzone i buduje międzyczasy", () => {
    const route = straightRoute(700, 3.33);
    const raw = route.map((p) => [
      p.lat,
      p.lng,
      Date.parse(p.recordedAt) / 1000,
      p.elapsedSec,
      5,
      0,
    ]);
    raw.splice(10, 0, [Number.NaN, 21, 0, 10, 5, 0], [1, 2, 3]);
    expect(nativeRoute({ present: true, route: raw })).toHaveLength(701);
    const draft = nativeRunDraft({
      present: true,
      sessionId: "s",
      date: "2026-11-12",
      startedAt: route[0].recordedAt,
      durationSec: 700,
      distanceM: 2331,
      route: raw,
    });
    expect(draft.splits.filter((s) => !s.isPartial)).toHaveLength(2);
    expect(draft.splits[0].paceSecPerKm).toBeCloseTo(300, -1);
  });
  it("bez trasy (starsza wersja aplikacji) daje sam wynik", () => {
    const draft = nativeRunDraft({
      present: true,
      sessionId: "s",
      date: "2026-11-12",
      startedAt: "2026-11-12T10:00:00Z",
      durationSec: 600,
      distanceM: 2000,
    });
    expect(draft.route).toEqual([]);
    expect(draft.splits).toEqual([]);
  });
});

describe("historia biegów w telefonie", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
  };
  const draft = (sessionId: string, seconds = 600): RunningActivityDraft => {
    const route = straightRoute(seconds);
    return {
      sessionId,
      date: "2026-11-12",
      startedAt: route[0].recordedAt,
      endedAt: route.at(-1)!.recordedAt,
      durationSec: seconds,
      distanceM: seconds * 3.33,
      avgPaceSecPerKm: 300,
      route,
      splits: [],
      intervalResults: [],
      source: "gps",
    };
  };

  it("zapisuje trasę z międzyczasami i odtwarza ją do mapy", () => {
    const storage = memory();
    expect(saveRunToHistory("u1", historyEntryFromDraft(draft("a"), "Bieg: tempo"), storage)).toBe(
      true,
    );
    const [entry] = loadRunHistory("u1", storage);
    expect(entry.title).toBe("Bieg: tempo");
    expect(entry.splits.length).toBeGreaterThan(0);
    const route = historyRoute(entry);
    expect(route).toHaveLength(601);
    expect(route[0].lat).toBeCloseTo(52, 4);
    // Inne konto nie widzi tej historii.
    expect(loadRunHistory("u2", storage)).toEqual([]);
  });

  it("jeden wpis na sesję, limit wpisów, usuwanie", () => {
    const storage = memory();
    for (let i = 0; i < HISTORY_LIMIT + 5; i += 1)
      saveRunToHistory("u1", historyEntryFromDraft(draft(`s${i}`, 30), "Bieg"), storage);
    saveRunToHistory("u1", historyEntryFromDraft(draft("s34", 40), "Bieg"), storage);
    const list = loadRunHistory("u1", storage);
    expect(list).toHaveLength(HISTORY_LIMIT);
    expect(list[0].sessionId).toBe("s34");
    expect(list.filter((e) => e.sessionId === "s34")).toHaveLength(1);
    removeRunFromHistory("u1", "s34", storage);
    expect(loadRunHistory("u1", storage).some((e) => e.sessionId === "s34")).toBe(false);
  });

  it("przy braku miejsca usuwa najstarsze wpisy zamiast tracić nowy bieg", () => {
    const storage = memory();
    for (let i = 0; i < 5; i += 1)
      saveRunToHistory("u1", historyEntryFromDraft(draft(`s${i}`, 50), "Bieg"), storage);
    const full = {
      getItem: storage.getItem,
      setItem: (k: string, v: string) => {
        if (v.length > 7_000) throw new Error("QuotaExceededError");
        storage.setItem(k, v);
      },
    };
    expect(saveRunToHistory("u1", historyEntryFromDraft(draft("new", 50), "Bieg"), full)).toBe(
      true,
    );
    const list = loadRunHistory("u1", storage);
    expect(list[0].sessionId).toBe("new");
    expect(list.length).toBeLessThan(6);
  });

  it("długą trasę zmniejsza, zachowując początek, koniec i przerwy segmentów", () => {
    const route = [...straightRoute(4000, 3, 0), ...straightRoute(2000, 3, 1, 5000)];
    const thin = thinRoute(route, 500);
    expect(thin.length).toBeLessThan(560);
    expect(thin[0]).toBe(route[0]);
    expect(thin.at(-1)).toBe(route.at(-1));
    expect(routeSegments(thin)).toHaveLength(2);
  });

  it("odrzuca uszkodzone dane historii", () => {
    const storage = memory();
    storage.setItem("ballwise:run-history:v1:u1", "{nie json");
    expect(loadRunHistory("u1", storage)).toEqual([]);
    storage.setItem("ballwise:run-history:v1:u1", JSON.stringify([{ schema: 1, points: "x" }]));
    expect(loadRunHistory("u1", storage)).toEqual([]);
  });
});

describe("szkic trasy bez mapy", () => {
  it("rzutuje trasę do ramki i dzieli segmenty", () => {
    const route = [...straightRoute(20, 3, 0), ...straightRoute(20, 3, 1, 100)];
    const paths = projectRoute(route, 320, 200);
    expect(paths).toHaveLength(2);
    const numbers = paths
      .join(" ")
      .match(/-?\d+(\.\d+)?/g)!
      .map(Number);
    expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...numbers)).toBeLessThanOrEqual(320);
  });
});
