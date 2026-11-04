/** Real session route, frozen legacy data, actual technique sheets/media; no account writes. */
export async function checkLegacyStrengthUI({ browser, base, work, ensure, views }) {
  const path = await import("node:path");
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    isMobile: true,
    hasTouch: true,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(base + "?screen=journey&legacy=1");
    await page
      .locator('[data-journey-path="/sesja/2026-11-01"] .bw-exercise-open')
      .first()
      .waitFor();
    const original = await page.evaluate(() =>
      JSON.stringify(window.__journeyQA.state().plan.find((s) => s.dbId === "legacy-18")),
    );
    ensure(
      (await page.locator(".bw-exercise-open").count()) === 13,
      "Legacy duplicates are not grouped",
    );
    ensure(
      (await page.locator(".bw-training-preview-summary").count()) === 1,
      "Missing instruction preview caption",
    );
    await page.screenshot({ path: path.join(work, "stara-sesja-390.png"), fullPage: false });
    await page.locator(".bw-exercise-check").first().tap();
    await page.getByRole("dialog").waitFor();
    await page.getByRole("dialog").getByRole("button", { name: "Zamknij", exact: true }).tap();
    await page.locator('.bw-sheet[data-state="open"]').waitFor({ state: "detached" });
    for (let index = 0; index < 13; index++) {
      await page.locator(".bw-exercise-open").nth(index).tap();
      const sheet = page.getByRole("dialog");
      await sheet.waitFor();
      await page.waitForFunction(
        () =>
          document.querySelector('.bw-sheet[data-state="open"]')?.getBoundingClientRect().top <
          innerHeight * 0.2,
      );
      ensure(
        (await sheet.locator("ol li").count()) >= 2,
        `Legacy row ${index}: no technique steps`,
      );
      const media = sheet.locator(".bw-exercise-detail-media");
      ensure(
        (await media.locator('img,iframe,svg[role="img"],[role="img"]').count()) > 0,
        `Legacy row ${index}: no technique visual`,
      );
      for (const img of await media.locator("img").all())
        await img.evaluate((image) => image.decode());
      if (index === 4) {
        ensure(
          (await media.locator("img").count()) === 1,
          "Strength preview does not start with the technique illustration",
        );
        ensure(
          (await sheet.locator("iframe").count()) === 0,
          "Animation controls displace the first technique view",
        );
        const instructions = await sheet.getByText("Jak wykonać", { exact: true }).boundingBox();
        ensure(
          instructions && instructions.y < 844,
          "Technique heading is pushed below the first screen",
        );
      }
      ensure(
        (await sheet.getByRole("button", { name: "Zapisz serie", exact: true }).count()) === 0,
        "Legacy preview allows recording",
      );
      if (await sheet.locator(".bw-exercise-original-entries").count()) {
        const title = await sheet.locator("h2").textContent();
        if (title.includes("Uginanie"))
          ensure(
            (await sheet.locator(".bw-exercise-original-entries li").count()) === 5,
            "Original curl prescriptions were lost",
          );
      }
      if (index === 0 || index === 4)
        await page.screenshot({ path: path.join(work, `stara-sesja-technika-${index}.png`) });
      await sheet.getByRole("button", { name: "Zamknij", exact: true }).tap();
      await page.locator('.bw-sheet[data-state="open"]').waitFor({ state: "detached" });
    }
    ensure(
      (await page.evaluate(() =>
        JSON.stringify(window.__journeyQA.state().plan.find((s) => s.dbId === "legacy-18")),
      )) === original,
      "Legacy history changed while opening technique",
    );
    ensure(
      (await page.evaluate(() => window.__journeyQA.starts.length)) === 0,
      "Opening archived techniques starts a workout",
    );
    views.push("archiwalne-18-wpisow-13-technik-pierwszy-dotyk");
    await page.setViewportSize({ width: 320, height: 640 });
    await page.locator(".bw-exercise-open").first().tap();
    await page.getByRole("dialog").waitFor();
    await page.addStyleTag({ content: "html{font-size:200%}" });
    ensure(
      (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1,
      "Legacy preview overflows at 320px/200% text",
    );
    await page.screenshot({ path: path.join(work, "stara-sesja-technika-320-duzy-tekst.png") });
    views.push("archiwalna-technika-320-duza-czcionka");
    ensure(!errors.length, "Legacy errors: " + errors.join("; "));
  } catch (error) {
    await page.screenshot({ path: path.join(work, "stara-sesja-blad.png"), fullPage: true });
    throw error;
  } finally {
    await page.close();
  }
}
