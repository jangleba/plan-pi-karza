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
      await page.locator(".bw-exercise-open:visible").first().waitFor();
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
        for (const toggle of await page.locator(".bw-preparation-toggle").all())
          if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
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
        for (const toggle of await page.locator(".bw-preparation-toggle").all())
          if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
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
    // Advanced declaration with blank tenure (the full-week Thursday fixture went with the week engine).
    await page.goto(base + "?screen=strength-engine&experience=advanced&tenure=blank");
    await page.locator(".bw-exercise-open:visible").first().waitFor();
    ensure(
      (await page.locator('.bw-preparation-toggle[aria-expanded="false"]').count()) === 2,
      "Preparation stages should start compact",
    );
    await page.screenshot({
      path: path.join(work, "sila-staz-pusty-kompaktowo.png"),
      fullPage: true,
    });
    views.push("sila-zwijane-przygotowanie");
    await page.getByRole("button", { name: "Dopasuj trening siłowy", exact: true }).click();
    const experienceSheet = page.getByRole("dialog", { name: "Doświadczenie siłowe", exact: true });
    await experienceSheet.waitFor();
    ensure(
      (await experienceSheet.getByRole("status").textContent()).includes("wprowadzający"),
      "Unknown tenure effect must be explained",
    );
    await experienceSheet.getByRole("button", { name: "2 lata lub więcej", exact: true }).click();
    ensure(
      (await experienceSheet.getByLabel("Ile miesięcy regularnego treningu?").inputValue()) ===
        "24",
      "Explicit tenure choice was not saved to the draft",
    );
    await page.screenshot({ path: path.join(work, "sila-szybki-wybor-stazu.png") });
    await experienceSheet.getByRole("button", { name: "Zapisz odpowiedzi", exact: true }).click();
    await page.getByRole("button", { name: "Doświadczenie siłowe", exact: true }).waitFor();
    ensure(
      !(await page.locator("h1").textContent()).includes("podstawy"),
      "Confirmed strength experience must update the generated session",
    );
    ensure(
      (await page.locator(".bw-exercise-open:visible").allTextContents()).some((t) =>
        t.includes("Wyciskanie hantli"),
      ),
      "Confirmed experience must affect available upper-body work",
    );
    await page.screenshot({
      path: path.join(work, "sila-potwierdzony-staz.png"),
      fullPage: true,
    });
    views.push("sila-staz-wybor-zapis-i-rzeczywiste-przeliczenie");
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(base + "?screen=strength-engine");
    await page.locator(".bw-exercise-open:visible").first().waitFor();
    for (const toggle of await page.locator(".bw-preparation-toggle").all())
      if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
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
