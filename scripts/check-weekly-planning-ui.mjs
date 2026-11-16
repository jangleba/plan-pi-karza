import fs from "node:fs/promises";
import path from "node:path";

/** The production Plan screen and engine; only the account save adapter is inert. */
export async function checkWeeklyPlanningUI({ browser, base, work }) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const reports = [],
    errors = [],
    layoutProblems = [];
  const ensure = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === new URL(base).origin
      ? route.continue()
      : route.abort(),
  );
  const screen = page.locator(".bw-plan-screen");
  const settings = page.getByRole("region", { name: "Cele tygodnia", exact: true });
  const coverage = page.getByRole("region", {
    name: "Pokrycie celów tygodniowych",
    exact: true,
  });
  const preset = () =>
    settings.getByRole("button", {
      name: "2 siłowe · 2 sprinty · 1 bieg",
      exact: true,
    });
  async function inspect(name, anchor, details = {}) {
    await anchor.scrollIntoViewIfNeeded();
    const dimensions = await screen.evaluate((el) => {
      const controls = [
        ".bw-weekly-settings button",
        ".bw-weekly-settings select",
        ".bw-weekly-check",
        ".bw-weekly-coverage summary",
        ".bw-plan-settings > summary",
        ".bw-plan-select select",
        ".bw-plan-preview > button",
        ".bw-wk-head button",
        ".bw-wk-exercises summary",
        ".bw-wk-open",
      ].join(",");
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        smallTargets: [...el.querySelectorAll(controls)]
          .map((control) => {
            const box = control.getBoundingClientRect();
            return {
              label: control.getAttribute("aria-label") || control.textContent.trim(),
              width: box.width,
              height: box.height,
            };
          })
          .filter(
            (box) => box.width > 0 && box.height > 0 && (box.width < 43.5 || box.height < 43.5),
          ),
      };
    });
    if (dimensions.overflow > 1) layoutProblems.push(name + ": horizontal overflow");
    if (dimensions.smallTargets.length)
      layoutProblems.push(
        name + ": touch target below 44px: " + JSON.stringify(dimensions.smallTargets),
      );
    await page.screenshot({ path: path.join(work, "weekly-" + name + ".png") });
    reports.push({
      case: name,
      ...details,
      ...dimensions,
      passed: dimensions.overflow <= 1 && dimensions.smallTargets.length === 0,
    });
  }
  async function coverageRows() {
    return coverage
      .locator("details")
      .evaluateAll((weeks) =>
        weeks.map((week) =>
          Object.fromEntries(
            [...week.querySelectorAll("tbody tr")].map((row) => [
              row.querySelector("th").textContent.trim(),
              row.querySelector("td").textContent.trim().replace(/\s+/g, " "),
            ]),
          ),
        ),
      );
  }
  try {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(base + "?page=1&kind=planning&phase=preview");
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.locator('[data-session-audit-path="/plan"]').waitFor();
      const savedBefore = await page.evaluate(() => JSON.stringify(window.__sessionAudit.state()));
      await screen.locator(".bw-plan-settings > summary").click();
      await preset().click();
      await screen.getByRole("heading", { name: "Twój plan · 4 tygodnie", exact: true }).waitFor();
      ensure(
        (await settings.getByLabel("Sprinty na tydzień", { exact: true }).inputValue()) === "2",
        "Preset lost two sprint sessions",
      );
      ensure(
        (await settings.getByLabel("Biegi na tydzień", { exact: true }).inputValue()) === "1",
        "Preset lost one running session",
      );
      ensure(
        (await settings.getByLabel("Pełne dni odpoczynku", { exact: true }).inputValue()) === "1",
        "Preset lost its minimum full rest day",
      );
      ensure(
        await settings
          .getByRole("checkbox", { name: "Lekka technika lub mobilność w pozostałe wolne dni" })
          .isChecked(),
        "Preset disabled light-day filling",
      );
      ensure(
        (await page.evaluate(() => window.__sessionAudit.receipts.length)) === 0,
        "Selecting weekly goals saved before confirmation",
      );
      ensure(
        (await page.evaluate(() => JSON.stringify(window.__sessionAudit.state()))) === savedBefore,
        "Weekly draft changed the saved plan or profile",
      );
      ensure(
        (await page.evaluate(() => localStorage.getItem("session66:qa-planning-saved"))) === null,
        "Weekly draft persisted before the explicit save",
      );
      await inspect("draft-settings-" + width, settings);
      const previewRows = await coverageRows();
      ensure(previewRows.length === 4, "Weekly preview does not cover all four rolling weeks");
      await inspect("draft-coverage-" + width, coverage);

      await screen.getByRole("button", { name: "Wróć do zapisanego planu", exact: true }).click();
      ensure(
        (await page.evaluate(() => window.__sessionAudit.receipts.length)) === 0,
        "Cancelling weekly choices saved the draft",
      );
      ensure(
        (await page.evaluate(() => JSON.stringify(window.__sessionAudit.state()))) === savedBefore,
        "Cancelling weekly choices mutated the saved state",
      );
      ensure(
        (await settings
          .getByRole("button", { name: "Automatycznie z profilu", exact: true })
          .getAttribute("aria-pressed")) === "true",
        "Cancelling did not restore the saved automatic choice",
      );
      await preset().click();
      const save = screen.getByRole("button", {
        name: /^Zapisz plan(?: z pokazanymi ograniczeniami)?$/,
      });
      await save.waitFor();
      ensure(
        await save.isEnabled(),
        "The explicit plan save is unavailable in the inert QA adapter",
      );
      await save.click();
      await page.waitForFunction(() =>
        window.__sessionAudit.receipts.some((receipt) => receipt.kind === "activate-plan"),
      );
      await screen.locator(".bw-plan-preview").waitFor({ state: "detached" });
      const saved = await page.evaluate(() => {
        const audit = window.__sessionAudit;
        const state = audit.state();
        const plan = state.plan;
        const counts = Array.from({ length: 4 }, (_, index) => {
          const days = plan.slice(index * 7, index * 7 + 7);
          const slots = days.flatMap((day) => [
            day,
            ...(day.secondSession ? [day.secondSession] : []),
          ]);
          const hasRole = (session, role) => session.engineV2?.roles?.includes(role);
          return {
            startDate: days[0]?.date,
            days: days.length,
            slots: slots.length,
            strength: slots.filter(
              (session) => hasRole(session, "strengthA") || hasRole(session, "strengthB"),
            ).length,
            speed: slots.filter((session) => hasRole(session, "speed")).length,
            endurance: slots.filter((session) => hasRole(session, "endurance")).length,
            rest: days.filter(
              (day) =>
                day.dayType === "rest" &&
                !day.engineV2 &&
                !day.secondSession &&
                !day.externalCommitment,
            ).length,
            external: days.flatMap((day, dayIndex) =>
              [day, ...(day.secondSession ? [day.secondSession] : [])].flatMap(
                (session, slotIndex) =>
                  session.externalCommitment || ["club", "match"].includes(session.dayType)
                    ? [
                        {
                          dayIndex,
                          slotIndex,
                          date: day.date,
                          dayType: session.dayType,
                          title: session.title,
                          durationMin: session.durationMin,
                        },
                      ]
                    : [],
              ),
            ),
          };
        });
        return {
          receipts: audit.receipts.map((receipt) => receipt.kind),
          preferences: plan[0]?.planInputs,
          profile: state.profile,
          count: plan.length,
          firstDate: plan[0]?.date,
          lastDate: plan.at(-1)?.date,
          counts,
        };
      });
      ensure(
        saved.receipts.length === 1 && saved.receipts[0] === "activate-plan",
        "Weekly save was duplicated or wrote a session result",
      );
      ensure(
        saved.count === 28 && saved.firstDate === "2026-11-16" && saved.lastDate === "2026-12-13",
        "Saved weekly plan is not a complete 28-day window",
      );
      ensure(
        JSON.stringify(saved.preferences.weeklyTargets) ===
          JSON.stringify({ strength: 2, speed: 2, endurance: 1 }) &&
          saved.preferences.fillRestDays === true &&
          saved.preferences.minFullRestDays === 1,
        "Saved plan inputs lost the confirmed weekly preferences",
      );
      const savedRows = await coverageRows();
      ensure(
        JSON.stringify(savedRows) === JSON.stringify(previewRows),
        "Saving changed the weekly coverage shown in the preview",
      );
      for (let index = 0; index < saved.counts.length; index++) {
        const week = saved.counts[index];
        const rows = savedRows[index];
        ensure(
          week.days === 7 && week.rest >= 1,
          "Week " + (index + 1) + " lost its seven days or minimum full rest day",
        );
        ensure(
          rows.Siła === `${week.strength} / 2` &&
            rows.Sprint === `${week.speed} / 2` &&
            rows.Bieganie === `${week.endurance} / 1` &&
            rows["Pełny odpoczynek"] === `${week.rest} / min. 1`,
          "Weekly coverage disagrees with actual physical sessions in week " + (index + 1),
        );
        const weekList = page.getByRole("region", { name: "Tydzień planu", exact: true });
        ensure(
          (await weekList.locator(".bw-wk-days > li").count()) === week.days,
          "Plan week omitted a calendar day",
        );
        ensure(
          (await weekList.locator(".bw-wk-session").count()) === week.slots,
          "Plan week omitted a physical session slot",
        );
        for (const external of week.external) {
          const day = weekList.locator(".bw-wk-days > li").nth(external.dayIndex);
          const slot = day.locator(".bw-wk-session").nth(external.slotIndex);
          const shown = await slot.locator(".bw-wk-copy > strong").innerText();
          ensure(
            shown === external.title && (await day.getAttribute("data-rest")) === null,
            `${external.dayType} on ${external.date} is incorrectly presented as full rest`,
          );
          ensure(
            (await slot.locator(".bw-session-kind").innerText()) ===
              (external.dayType === "club" ? "Klub" : "Mecz"),
            `${external.dayType} on ${external.date} lost its session category`,
          );
        }
        if (index < saved.counts.length - 1)
          await weekList.getByRole("button", { name: "Następny tydzień", exact: true }).click();
      }
      await inspect("saved-coverage-" + width, coverage, {
        weeks: saved.counts,
        receipts: saved.receipts,
      });
      const planBeforeReload = await page.evaluate(() =>
        JSON.stringify(window.__sessionAudit.state().plan),
      );
      await page.reload();
      await coverage.waitFor();
      ensure(
        (await page.evaluate(() => JSON.stringify(window.__sessionAudit.state().plan))) ===
          planBeforeReload,
        "Hydration changed the explicitly saved physical sessions",
      );
      ensure(
        JSON.stringify(await coverageRows()) === JSON.stringify(savedRows),
        "Hydration lost the saved weekly coverage",
      );
      await screen.locator(".bw-plan-settings > summary").click();
      ensure(
        (await preset().getAttribute("aria-pressed")) === "true" &&
          (await settings.getByLabel("Sprinty na tydzień", { exact: true }).inputValue()) === "2" &&
          (await settings.getByLabel("Biegi na tydzień", { exact: true }).inputValue()) === "1" &&
          (await settings.getByLabel("Pełne dni odpoczynku", { exact: true }).inputValue()) ===
            "1" &&
          (await settings
            .getByRole("checkbox", {
              name: "Lekka technika lub mobilność w pozostałe wolne dni",
            })
            .isChecked()),
        "Hydration did not restore the confirmed weekly choices",
      );
      ensure(
        (await page.evaluate(() => window.__sessionAudit.receipts.length)) === 0,
        "Hydration activated or wrote another plan",
      );
      await inspect("hydrated-settings-" + width, settings);
    }
    ensure(errors.length === 0, errors.join("; "));
    ensure(layoutProblems.length === 0, layoutProblems.join("\n"));
    return reports;
  } catch (error) {
    await page.screenshot({ path: path.join(work, "weekly-failure.png"), fullPage: true });
    await fs.writeFile(
      path.join(work, "weekly-failure.json"),
      JSON.stringify(
        {
          error: String(error),
          errors,
          layoutProblems,
          text: await page.locator("body").innerText(),
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    await fs.writeFile(
      path.join(work, "weekly-results.json"),
      JSON.stringify({ reports, errors, layoutProblems }, null, 2),
    );
    await page.close();
  }
}
