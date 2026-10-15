import { describe, expect, it } from "vitest";
import { buildRecoveryProtocol, expandPreparationSteps } from "./protocols";
import {
  initialPlayback,
  nextPlayback,
  parsePlayback,
  pausePlayback,
  remainingPlaybackMs,
  startPlayback,
  tickPlayback,
} from "./playback";
const program = buildRecoveryProtocol("calves");
program.exercises = [program.exercises[2], program.exercises[3]];
const steps = expandPreparationSteps(program);
describe("czasomierz regeneracji", () => {
  it("odlicza pracę, zmianę strony, drugą stronę i odpoczynek", () => {
    let p = startPlayback(initialPlayback(steps), 1000);
    expect(remainingPlaybackMs(p, 11000)).toBe(20000);
    p = tickPlayback(p, steps, 31000);
    expect(steps[p.index].type).toBe("switch");
    expect(p.remainingMs).toBe(10000);
    p = tickPlayback(p, steps, 41000);
    expect(steps[p.index].side).toBe("right");
    expect(p.remainingMs).toBe(30000);
    p = tickPlayback(p, steps, 71000);
    expect(steps[p.index].type).toBe("rest");
    expect(p.remainingMs).toBe(15000);
  });
  it("pauza zachowuje sekundy i wznowienie nie liczy czasu pauzy", () => {
    let p = startPlayback(initialPlayback(steps), 1000);
    p = pausePlayback(p, 13000);
    expect(p.remainingMs).toBe(18000);
    expect(remainingPlaybackMs(p, 999999)).toBe(18000);
    p = startPlayback(p, 1000000);
    expect(remainingPlaybackMs(p, 1005000)).toBe(13000);
  });
  it("po długim zablokowaniu nie przeskakuje przez kilka stron i ćwiczeń", () => {
    const p = tickPlayback(startPlayback(initialPlayback(steps), 1000), steps, 9000000);
    expect(p.index).toBe(1);
    expect(p.remainingMs).toBe(10000);
  });
  it("pominięcie zapisuje pominięcie i przechodzi do kolejnego ćwiczenia", () => {
    const p = nextPlayback(startPlayback(initialPlayback(steps), 0), steps, 1000, true);
    expect(steps[p.index].exerciseIndex).toBe(1);
    expect(p.skipped).toEqual([0]);
  });
  it("odtwarza zapis zawsze w pauzie i odrzuca uszkodzone dane", () => {
    expect(parsePlayback({ ...startPlayback(initialPlayback(steps), 0) })?.running).toBe(false);
    expect(parsePlayback({ index: -1 })).toBeUndefined();
    expect(parsePlayback({ ...initialPlayback(steps), remainingMs: Infinity })).toBeUndefined();
  });
  it("kroki na powtórzenia czekają na potwierdzenie", () => {
    const manual = expandPreparationSteps(buildRecoveryProtocol("back")).filter(
      (s) => s.seconds == null,
    );
    const p = startPlayback(initialPlayback(manual), 0);
    expect(tickPlayback(p, manual, 1000000).index).toBe(0);
  });
});
