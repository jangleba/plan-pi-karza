/** Real cadence UI, fed by the session query; does not record training results. */
export async function checkTempoUI({ page, base, work, ensure }) {
  const path = await import("node:path");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(
    base + "?id=heavy_back_squat&embed=1&compact=1&autoplay=1&tempo=3-0-1-0&variant=box_touch",
  );
  await page.waitForFunction(() => window.BWPlayer?.ready);
  let state = await page.evaluate(() => window.BWPlayer.getState());
  ensure(state.tempo?.source === "session" && state.durationMs === 4000, "Session tempo not read");
  ensure(state.variant === "box_touch", "Box variant missing");
  ensure((await page.locator("#tempo-count").innerText()) === "3", "Missing initial countdown");
  ensure(!state.playing, "Reduced motion cadence autoplays");
  await page.evaluate(() => window.BWPlayer.renderAt(0.75));
  state = await page.evaluate(() => window.BWPlayer.getState());
  ensure(state.tempo.key === "concentric" && state.tempo.count === 1, "Zero pause inserts a delay");
  await page.evaluate(() => window.BWPlayer.renderAt(0.28));
  await page.screenshot({ path: path.join(work, "tempo-3-0-1-skrzynia.png"), fullPage: true });
  await page.evaluate(() => window.BWPlayer.renderAt(0));
  await page.getByRole("button", { name: "Odtwórz", exact: true }).tap();
  await page.waitForTimeout(1120);
  ensure(
    (await page.locator("#tempo-count").innerText()) === "2",
    "One real second did not advance countdown",
  );
  await page.getByRole("button", { name: "Pauza", exact: true }).tap();
  const stopped = await page.evaluate(() => window.BWPlayer.getState().phase);
  await page.waitForTimeout(150);
  ensure(
    (await page.evaluate(() => window.BWPlayer.getState().phase)) === stopped,
    "Paused countdown consumes time",
  );
  await page.getByText("Technika i tempo", { exact: true }).click();
  await page.locator("#tempo-input").fill("3-0-X-0");
  await page.getByRole("button", { name: "Zastosuj", exact: true }).tap();
  await page.evaluate(() => window.BWPlayer.renderAt(0.9));
  state = await page.evaluate(() => window.BWPlayer.getState());
  ensure(
    state.tempo.source === "preview" && state.tempo.dynamic && state.tempo.count === null,
    "X turned into fixed seconds",
  );
  ensure(
    (await page.locator("#tempo-unit").innerText()) === "dynamicznie",
    "Missing explosive intent label",
  );
  await page.screenshot({ path: path.join(work, "tempo-X-szkic.png"), fullPage: true });
  await page.getByRole("button", { name: "Wróć do instrukcji sesji", exact: true }).tap();
  ensure(
    (await page.evaluate(() => window.BWPlayer.getState().tempo.spec)) === "3–0–1–0",
    "Preview overwrote session tempo",
  );
  await page.selectOption("#speed", "0.5");
  ensure(
    (await page.locator("#tempo-speed").innerText()).includes("0,5"),
    "Slow preview speed not labelled",
  );
  await page.goto(base + "?id=plank&embed=1&compact=1&hold=30");
  await page.waitForFunction(() => window.BWPlayer?.ready);
  await page.evaluate(() => window.BWPlayer.renderAt(1));
  state = await page.evaluate(() => window.BWPlayer.getState());
  ensure(
    state.tempo.complete && state.tempo.count === 0 && !state.playing,
    "Hold wraps to another unrequested set",
  );
  await page.getByRole("button", { name: "Odtwórz", exact: true }).tap();
  state = await page.evaluate(() => window.BWPlayer.getState());
  ensure(state.phase < 0.1 && state.tempo.count === 30, "Explicit replay does not restart hold");
  await page.evaluate(() => window.BWPlayer.stop());
  await page.goto(base + "?id=barbell_deadlift&embed=1&compact=1&tempo=3-0-1-0");
  await page.waitForFunction(() => window.BWPlayer?.ready);
  state = await page.evaluate(() => window.BWPlayer.getState());
  ensure(
    state.tempo.key === "concentric" && state.tempo.count === 1,
    "Deadlift starts from the wrong phase",
  );
  await page.goto(base + "?id=a_skip&embed=1&compact=1&tempo=3-0-1-0");
  await page.waitForFunction(() => window.BWPlayer?.ready);
  ensure(
    await page.locator("#tempo-panel").isHidden(),
    "Strength cadence forced onto a running drill",
  );
  await page.goto(base + "?id=goblet_squat&embed=1&compact=1");
  await page.waitForFunction(() => window.BWPlayer?.ready);
  ensure(await page.locator("#tempo-panel").isHidden(), "Missing session tempo silently invented");
  await page.locator("#tempo-example").tap();
  ensure(
    (await page.evaluate(() => window.BWPlayer.getState().tempo.source)) === "preview",
    "Example tempo not marked as preview",
  );
  return { name: "session-tempo-real-clock-zero-pause-X-hold-and-preview-only", passed: true };
}
