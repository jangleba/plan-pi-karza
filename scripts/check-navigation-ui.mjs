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
    // The week engine was removed: Start and Plan show "Plan wkrótce", so a
    // session is opened by its deep link and the tabs are checked around it.
    await page.goto(base + "?screen=journey&path=/sesja/2026-11-02");
    await at("/sesja/2026-11-02");
    await page.getByRole("button", { name: "Plan sesji", exact: true }).click();
    await page
      .locator(".bw-focus-plan button")
      .filter({ hasText: /Przysiad/i })
      .first()
      .click();
    await page.getByRole("button", { name: /Technika i animacja/ }).click();
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
    await page.getByRole("button", { name: "Plan sesji", exact: true }).click();
    await page
      .locator(".bw-focus-plan button")
      .filter({ hasText: /Przysiad/i })
      .first()
      .click();
    await page.locator(".bw-focus-card .bw-set-fields").waitFor();
    await snap("przejscie-instrukcja-do-zapisu");
    await page
      .getByRole("button", { name: /Wstecz|Wróć do planu/ })
      .first()
      .click();
    await at("/plan");
    await page.getByRole("status", { name: "Plan wkrótce" }).waitFor();
    await snap("przejscie-plan-wkrotce");
    await tab("Start", "/start");
    await page.getByRole("status", { name: "Plan wkrótce" }).waitFor();
    await tab("Fuel", "/fuel");
    await page.getByRole("heading", { name: "Fuel", exact: true }).waitFor();
    await snap("przejscie-fuel");
    await tab("Postęp", "/postep");
    await page.getByRole("tab", { name: "Historia", exact: true }).click();
    await snap("przejscie-postep-historia");
    await tab("IQ", "/football-iq");
    await page.locator('[data-iq-renderer="ready"]').waitFor();
    const skipTutorial = page.getByRole("button", {name:"Pomiń",exact:true});
    if(await skipTutorial.count()) await skipTutorial.click();
    await snap("przejscie-iq");
    await page.getByRole("button",{name:"Wróć do aplikacji",exact:true}).click();
    await at("/start");
    await page.getByRole("button", { name: /BallWise Lab/ }).click();
    await at("/lab");
    await page.locator(".bl-test-card").first().waitFor();
    await snap("przejscie-lab");
    // Tomorrow's session opened by its link is a preview, not another start.
    await page.goto(base + "?screen=journey&path=/sesja/2026-11-03");
    await at("/sesja/2026-11-03");
    ensure(
      (await page.evaluate(() => window.__journeyQA.starts.length)) === 0,
      "Tomorrow's preview started a session",
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
