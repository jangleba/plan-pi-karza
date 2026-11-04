/** Actual generated strength sessions: all row taps, instructions, local media and modal-to-logging handoff. */
export async function checkStrengthUI({ browser, base, work, ensure, views }) {
  const path = await import("node:path");
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    for (const [experience, goal] of [
      ["unknown", "strength"],
      ["intermediate", "strength"],
      ["advanced", "power"],
    ]) {
      await page.goto(base + `?screen=strength-engine&experience=${experience}&goal=${goal}`);
      await page.locator(".bw-exercise-open").last().waitFor();
      await page.evaluate(() => document.fonts.ready);
      const count = await page.locator(".bw-exercise-open").count();
      ensure(count > 5 && count < 18, `Unexpected generated strength count: ${count}`);
      ensure(
        (await page
          .getByText("Nie ma odpowiedniego wariantu przy tych ustawieniach.", { exact: false })
          .count()) === 0,
        "Generated session contains unusable entries",
      );
      ensure(
        (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1,
        "Strength page overflows",
      );
      if (experience === "unknown") {
        await page.screenshot({
          path: path.join(work, "sila-silnik-podstawy.png"),
        });
        views.push("sila-silnik-podstawy");
        for (let i = 0; i < count; i++) {
          const row = page.locator(".bw-exercise-open").nth(i);
          await row.click();
          const sheet = page.getByRole("dialog");
          await sheet.waitFor();
          await page.waitForFunction(
            () =>
              document
                .querySelector('.bw-sheet[data-state="open"]')
                ?.getAttribute("data-panel-expanded") === "true",
          );
          ensure(
            (await sheet.locator("ol li").count()) >= 2,
            `Missing actual instruction steps for row${i}`,
          );
          const media = sheet.locator(".bw-exercise-detail-media");
          ensure(
            (await media.locator('img,svg[role="img"],iframe,[role="img"]').count()) > 0,
            `No media for row${i}`,
          );
          for (const img of await media.locator("img").all()) {
            await img.evaluate((image) => image.decode());
            ensure(
              await img.evaluate((image) => image.naturalWidth > 0),
              `Image failed to load for row${i}`,
            );
          }
          for (const iframe of await media.locator("iframe").all()) {
            await iframe.contentFrame().locator("body").waitFor();
          }
          ensure(
            (await sheet
              .getByText("Brak ilustracji dla tego ćwiczenia", { exact: false })
              .count()) === 0,
            `Missing illustration placeholder for row${i}`,
          );
          if (i === 4 || i === 6 || i === count - 1)
            await page.screenshot({ path: path.join(work, `sila-szczegoly-${i}.png`) });
          await sheet.getByRole("button", { name: "Zamknij", exact: true }).click();
          await page.waitForFunction(() => !document.querySelector('.bw-sheet[data-state="open"]'));
        }
        views.push(`sila-wszystkie-${count}-cwiczen-otwieraja-instrukcje-i-media`);
        const trigger = page.getByRole("button", { name: "Dopasuj trening siłowy", exact: true });
        await trigger.click();
        await page.getByRole("dialog", { name: "Doświadczenie siłowe", exact: true }).waitFor();
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Zamknij", exact: true })
          .click();
        views.push("sila-doswiadczenie-w-panelu");
      } else {
        await page.locator(".bw-exercise-open").nth(4).click();
        await page.getByRole("dialog").waitFor();
        await page.screenshot({ path: path.join(work, `sila-${experience}-szczegoly.png`) });
        await page.getByRole("button", { name: "Zapisz serie", exact: true }).click();
        ensure(
          (await page.locator('.bw-sheet[data-state="open"]').count()) === 0,
          "Logging overlaps the instruction sheet",
        );
        await page.locator(".bw-exercise-panel:not([hidden]) .bw-set-fields").waitFor();
        views.push(`sila-${experience}-panel-i-zapis-serii`);
      }
    }
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(base + "?screen=strength-engine");
    await page.locator(".bw-exercise-open").last().waitFor();
    await page.locator(".bw-exercise-open").nth(4).click();
    const sheet = page.getByRole("dialog");
    await sheet.waitFor();
    await page.addStyleTag({ content: "html{font-size:200% !important}" });
    ensure(
      (await sheet.locator(".bw-sheet-scroll").evaluate((e) => e.scrollWidth - e.clientWidth)) <= 1,
      "Strength sheet overflows at large text",
    );
    await page.screenshot({ path: path.join(work, "sila-320-duzy-tekst.png") });
    views.push("sila-320-duzy-tekst");
    ensure(!errors.length, errors.join("; "));
  } finally {
    await page.close();
  }
}
