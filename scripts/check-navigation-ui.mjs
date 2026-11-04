/** Navigation between the actual routes; account/storage adapters are isolated fixtures. */
export async function checkNavigationUI({ browser, base, work, ensure, views }) {
  const path = await import("node:path");
  const fs = await import("node:fs/promises");
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const errors = [],
    timings = [];
  page.on("pageerror", (error) => errors.push(error.message));
  async function at(route) {
    await page.locator(`[data-journey-path="${route}"]`).waitFor();
  }
  async function snap(name) {
    ensure(
      (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1,
      "Journey overflow: " + name,
    );
    await page.screenshot({ path: path.join(work, name + ".png"), fullPage: true });
    views.push(name);
  }
  async function tab(label, route) {
    const start = performance.now();
    await page
      .getByRole("navigation", { name: "Główna nawigacja" })
      .getByRole("link", { name: label, exact: true })
      .click();
    await at(route);
    timings.push({ route, elapsedMs: Math.round(performance.now() - start) });
  }
  try {
    await page.goto(base + "?screen=journey");
    await at("/start");
    await page.getByRole("button", { name: /Otwórz trening/ }).click();
    await at("/sesja/2026-11-02");
    const main = page
      .locator(".bw-training-stage")
      .filter({ has: page.locator("h2", { hasText: "Siła i moc" }) });
    await main.locator(".bw-exercise-open").first().click();
    const details = page.getByRole("dialog");
    await details.waitFor();
    ensure((await details.locator("ol li").count()) >= 2, "Full route has no instruction steps");
    ensure(
      (await details.getByRole("button", { name: "Zapisz serie", exact: true }).count()) === 0,
      "Preview allows logging before starting",
    );
    ensure(
      (await page.evaluate(() => window.__journeyQA.starts.length)) === 0,
      "Opening instructions started the workout",
    );
    await snap("przejscie-instrukcja-przed-startem");
    await details.getByRole("button", { name: "Zamknij", exact: true }).click();
    await page.getByRole("button", { name: "Rozpocznij trening", exact: true }).click();
    await page.getByText("Trening rozpoczęty.", { exact: true }).waitFor();
    ensure(
      (await page.evaluate(() => window.__journeyQA.starts.length)) === 1,
      "Explicit start was duplicated",
    );
    await main.locator(".bw-exercise-open").first().click();
    await page.getByRole("button", { name: "Zapisz serie", exact: true }).click();
    await page.locator(".bw-exercise-panel:not([hidden]) .bw-set-fields").waitFor();
    await snap("przejscie-instrukcja-do-zapisu");
    await page
      .getByRole("button", { name: /Wstecz|Wróć do planu/ })
      .first()
      .click();
    await at("/start");
    await tab("Plan", "/plan");
    await page.locator(".bw-week-nav strong").waitFor();
    const before = await page.locator(".bw-week-nav strong").textContent();
    await page.getByRole("button", { name: "Następny tydzień", exact: true }).click();
    await page.waitForFunction(
      (previous) => document.querySelector(".bw-week-nav strong")?.textContent !== previous,
      before,
    );
    await snap("przejscie-nastepny-tydzien");
    const nextWeek = await page.locator(".bw-week-nav strong").textContent();
    await page.locator('.bw-plan-day-link[href^="/sesja/2026-11-09"]').first().click();
    await at("/sesja/2026-11-09");
    await page.locator(".bw-training-header").waitFor();
    ensure(
      !/\d\s+órze/.test(await page.locator("body").textContent()),
      "Sprint dose contains an amputated repetition label",
    );
    await page
      .getByRole("button", { name: /Wstecz|Wróć do planu/ })
      .first()
      .click();
    await at("/plan");
    await page.waitForFunction(
      (previous) => document.querySelector(".bw-week-nav strong")?.textContent === previous,
      nextWeek,
    );
    ensure(
      (await page.locator(".bw-week-nav strong").textContent()) === nextWeek,
      "Returning from a workout lost the selected week",
    );
    views.push("powrot-z-sesji-zachowuje-tydzien");
    await page.getByRole("button", { name: "Poprzedni tydzień", exact: true }).click();
    await page.waitForFunction(
      (previous) => document.querySelector(".bw-week-nav strong")?.textContent === previous,
      before,
    );
    await tab("Fuel", "/fuel");
    await page.getByRole("heading", { name: "Fuel", exact: true }).waitFor();
    await snap("przejscie-fuel");
    await tab("Postęp", "/postep");
    await page.getByRole("tab", { name: "Historia", exact: true }).click();
    await snap("przejscie-postep-historia");
    await tab("IQ", "/football-iq");
    await page.locator("[data-iq-scenario]").waitFor();
    await snap("przejscie-iq");
    await tab("Start", "/start");
    await page.getByRole("button", { name: /BallWise Lab/ }).click();
    await at("/lab");
    await page.locator(".bl-test-card").first().waitFor();
    await snap("przejscie-lab");
    await tab("Plan", "/plan");
    const day = page.locator('.bw-plan-day-link[href^="/sesja/2026-11-03"]').first();
    // The actual plan rows navigate, retaining the selected session date.
    await day.click();
    await at("/sesja/2026-11-03");
    ensure(
      (await page.evaluate(() => window.__journeyQA.starts.length)) === 1,
      "Tomorrow's preview started another session",
    );
    await page.setViewportSize({ width: 320, height: 640 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await snap("przejscie-podglad-320-duza-czcionka");
    ensure(!errors.length, "Journey errors: " + errors.join("; "));
    await fs.writeFile(
      path.join(work, "nawigacja.json"),
      JSON.stringify({ passed: true, adapter: "isolated", timings }, null, 2),
    );
  } catch (error) {
    if (await page.getByRole("button", { name: "Show Error", exact: true }).count())
      await page.getByRole("button", { name: "Show Error", exact: true }).click();
    await fs.writeFile(
      path.join(work, "nawigacja-blad.json"),
      JSON.stringify(
        {
          error: String(error),
          errors,
          body: (await page.locator("body").textContent()).slice(0, 5000),
        },
        null,
        2,
      ),
    );
    await page.screenshot({ path: path.join(work, "nawigacja-blad.png"), fullPage: true });
    throw error;
  } finally {
    await page.close();
  }
}
