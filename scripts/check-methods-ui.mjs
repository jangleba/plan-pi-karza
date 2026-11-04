/** Executes real method recipes, sheets and log forms using isolated authored accounts. */
export async function checkMethodsUI({ browser, base, work, ensure, views }) {
  const path = await import("node:path"),
    page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    for (const id of [
      "M02",
      "M07",
      "M08",
      "M10",
      "M12",
      "M14",
      "M15",
      "M18",
      "M19",
      "M20",
      "M21",
      "M22",
      "M25",
      "M26",
      "M28",
      "M29",
      "M30",
      "M31",
      "M33",
      "M39",
    ]) {
      await page.goto(base + `?screen=methods&method=${id}`);
      await page.locator(".bw-method-trigger").first().waitFor();
      ensure(
        (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1,
        `${id}: horizontal overflow`,
      );
      await page.locator(".bw-method-trigger").first().click();
      const sheet = page.getByRole("dialog", { name: "Metoda i warunki", exact: true });
      await sheet.waitFor();
      await sheet.getByRole("button", { name: "Biblioteka 44 metod i zasad", exact: true }).click();
      ensure(
        (await sheet.locator(".bw-method-source-list").count()) === 44,
        `${id}: incomplete library`,
      );
      await sheet.getByRole("button", { name: "Zamknij", exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('.bw-sheet[data-state="open"]'));
      if (["M08", "M12", "M14", "M39"].includes(id)) {
        const main = page
          .locator(".bw-training-stage")
          .filter({ has: page.locator("h2", { hasText: /Siła i moc/ }) });
        const row = main.locator(".bw-exercise-open").first();
        await row.click();
        await page.getByRole("dialog").waitFor();
        if (id === "M39") {
          const preview = page.getByRole("dialog").locator('[data-testid="velocity-preview"]');
          ensure((await preview.count()) === 1, "Velocity instruction preview is missing");
          ensure(
            (await preview.locator("input, form, button").count()) === 0,
            "Velocity instruction preview accepts measurements",
          );
        }
        ensure(
          (await page.getByRole("dialog").locator("ol li").count()) >= 2,
          `${id}: missing instructions`,
        );
        await page.getByRole("button", { name: "Zapisz serie", exact: true }).click();
        await page.locator(".bw-exercise-panel:not([hidden]) .bw-set-fields").waitFor();
        if (id === "M08") {
          const clock = page.locator(
            '.bw-exercise-panel:not([hidden]) [data-testid="method-clock"]',
          );
          await clock.getByRole("button", { name: "Uruchom zegar", exact: true }).click();
          await clock.getByRole("button", { name: "Grupa wykonana", exact: true }).click();
          ensure(
            (await clock.textContent()).includes("Odpoczynek"),
            "Cluster has no intra-set rest",
          );
          await clock.getByRole("button", { name: "Pauza", exact: true }).click();
          ensure((await clock.textContent()).includes("Wznów"), "Clock did not pause");
        }
        if (id === "M12")
          ensure(
            (await page
              .locator(".bw-exercise-panel:not([hidden])")
              .getByText("Ciężar", { exact: true })
              .count()) === 0,
            "Flywheel asks for kilograms",
          );
        if (id === "M39") {
          const v = page.locator('.bw-exercise-panel:not([hidden]) [data-testid="velocity-coach"]');
          for (const value of ["0.60", "0.48"]) {
            await v.getByLabel("Prędkość powtórzenia (m/s)").fill(value);
            await v.getByRole("button", { name: "Dodaj pomiar", exact: true }).click();
          }
          ensure(
            (await v.textContent()).includes("Osiągnięto ustawiony próg"),
            "Velocity loss feedback missing",
          );
        }
      } else if (["M18", "M25", "M26", "M29", "M30"].includes(id)) {
        const clock = page.locator('[data-testid="method-clock"]').first();
        await clock.getByRole("button", { name: "Uruchom zegar", exact: true }).click();
        if (["M18", "M25", "M30"].includes(id))
          await clock.getByRole("button", { name: "Próba wykonana", exact: true }).click();
      }
      if (["M08", "M10", "M12", "M29", "M39"].includes(id))
        await page.screenshot({ path: path.join(work, `metody-${id}.png`) });
      views.push(`metoda-${id}-receptura-panel-instrukcje`);
    }
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(base + "?screen=methods&method=M08");
    await page.locator(".bw-method-trigger").first().click();
    await page.getByRole("dialog").waitFor();
    await page.addStyleTag({ content: "html{font-size:200% !important}" });
    ensure(
      (await page
        .getByRole("dialog")
        .locator(".bw-sheet-scroll")
        .evaluate((e) => e.scrollWidth - e.clientWidth)) <= 1,
      "Method sheet overflows at 320px/large text",
    );
    views.push("metody-320-duzy-tekst");
    ensure(!errors.length, errors.join("; "));
  } finally {
    await page.close();
  }
}
