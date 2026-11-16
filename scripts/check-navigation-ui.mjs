/** Navigation between the actual routes; account/storage adapters are isolated fixtures. */
export async function checkNavigationUI({ browser, base, work, ensure, views }) {
  const path = await import("node:path");
  const fs = await import("node:fs/promises");
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const errors = [],
    timings = [],
    blockedRequests = [];
  // Only serve this run's local fixture assets; no account API can be contacted.
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (new URL(request.url()).origin === new URL(base).origin) return route.continue();
    blockedRequests.push({ method: request.method(), url: request.url() });
    return route.abort();
  });
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
    await page.goto(base + "?screen=journey&path=/sesja/2026-11-02");
    await at("/sesja/2026-11-02");
    await page.locator('.bw-runner[data-mode="preview"][data-view="list"]').waitFor();
    await page
      .locator(".bw-rplan button")
      .filter({ hasText: /Przysiad goblet/ })
      .click();
    await page.getByRole("button", { name: "Jak wykonać?", exact: true }).click();
    const instructions = page.getByRole("region", { name: "Jak wykonać", exact: true });
    await instructions.waitFor();
    ensure(
      (await instructions.locator("ol li").count()) >= 2,
      "Full route has no instruction steps",
    );
    ensure(
      (await page.locator(".bw-set-fields, .bw-set-table-wrap").count()) === 0,
      "Preview allows logging before starting",
    );
    ensure(
      (await page.evaluate(() => window.__journeyQA.starts.length)) === 0,
      "Opening instructions started the workout",
    );
    await snap("przejscie-instrukcja-przed-startem");
    await page.getByRole("button", { name: "Zamknij instrukcję", exact: true }).click();
    await page.getByRole("button", { name: "Rozpocznij trening", exact: true }).click();
    await page.locator('.bw-runner[data-mode="active"][data-view="exercise"]').waitFor();
    ensure(
      (await page.evaluate(() => window.__journeyQA.starts.length)) === 1,
      "Explicit start was duplicated",
    );
    ensure(
      (await page.getByRole("button", { name: "Rozpocznij trening", exact: true }).count()) === 0,
      "Started workout still offers another start",
    );
    await page.locator(".bw-set-table-wrap").waitFor();
    await snap("przejscie-instrukcja-do-zapisu");
    await page.getByRole("button", { name: "Wstecz", exact: true }).click();
    await at("/plan");
    await page.getByRole("region", { name: "Tydzień planu", exact: true }).waitFor();
    await page.getByRole("button", { name: /Otwórz trening:.*2 listopada$/ }).waitFor();
    await snap("przejscie-plan-tydzien");
    await tab("Start", "/start");
    await page.getByRole("heading", { name: "Dzisiaj", exact: true }).waitFor();
    await snap("przejscie-start");
    await tab("Fuel", "/fuel");
    await page.getByRole("heading", { name: "Fuel", exact: true }).waitFor();
    await snap("przejscie-fuel");
    await tab("Postęp", "/postep");
    await page.getByRole("tab", { name: "Historia", exact: true }).click();
    await snap("przejscie-postep-historia");
    await tab("IQ", "/football-iq");
    await page.locator('.fp-root[data-f5-variant][data-stage="intro"] canvas').waitFor();
    await page.getByRole("button", { name: "Graj", exact: true }).click();
    await page.locator('.fp-root[data-f5-variant][data-stage="ready"]').waitFor();
    await snap("przejscie-iq");
    await page.getByRole("button", { name: "Wróć", exact: true }).click();
    await at("/start");
    await page.getByRole("button", { name: /BallWise Lab/ }).click();
    await at("/lab");
    await page.locator(".bl-test-card").first().waitFor();
    await snap("przejscie-lab");
    // Open the saved future session through Plan, retaining this run's start receipt.
    await tab("Plan", "/plan");
    await page.getByRole("button", { name: /Otwórz trening:.*3 listopada$/ }).click();
    await at("/sesja/2026-11-03");
    await page.locator('.bw-runner[data-mode="preview"][data-view="list"]').waitFor();
    ensure(
      (await page.evaluate(() => window.__journeyQA.starts.length)) === 1,
      "Tomorrow's preview started another session",
    );
    ensure(
      (await page.getByRole("button", { name: /^Rozpocznij trening/ }).count()) === 0,
      "Tomorrow's preview offers a start",
    );
    await page
      .locator(".bw-rplan button")
      .filter({ hasText: /Przysiad goblet/ })
      .click();
    ensure(
      (await page.locator(".bw-set-fields, .bw-set-table-wrap").count()) === 0,
      "Tomorrow's preview allows recording",
    );
    await page.setViewportSize({ width: 320, height: 640 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await snap("przejscie-podglad-320-duza-czcionka");
    ensure(!errors.length, "Journey errors: " + errors.join("; "));
    ensure(
      !blockedRequests.some(({ method }) => !["GET", "HEAD", "OPTIONS"].includes(method)),
      "Journey attempted an external write: " + JSON.stringify(blockedRequests),
    );
    await fs.writeFile(
      path.join(work, "nawigacja.json"),
      JSON.stringify(
        {
          passed: true,
          adapter: "isolated",
          starts: await page.evaluate(() => window.__journeyQA.starts),
          timings,
          blockedRequests,
        },
        null,
        2,
      ),
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
