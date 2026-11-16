import fs from "node:fs/promises";
import path from "node:path";

/** Actual session UI on isolated authored fixtures. No hosted account or GPS writes. */
export async function checkTrainingFieldUI({ browser, base, work, presentation = "sheet" }) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const errors = [],
    reports = [],
    layoutProblems = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (presentation === "page") {
    // Exercise the GPS UI without a browser permission, a physical sensor or
    // actual location data. Emitted positions advance a private virtual clock.
    await page.addInitScript(() => {
      const realNow = Date.now.bind(Date);
      let offset = 0;
      Date.now = () => realNow() + offset;
      const watches = new Map();
      const calls = { current: 0, watch: 0, clear: 0 };
      let sequence = 0;
      let index = 0;
      const fix = () => ({
        timestamp: Date.now(),
        coords: {
          latitude: 50 + index * 0.0009,
          longitude: 19,
          accuracy: 4,
          altitude: null,
          altitudeAccuracy: null,
          heading: 0,
          speed: 3.3,
        },
      });
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition(success) {
            calls.current++;
            success(fix());
          },
          watchPosition(success) {
            calls.watch++;
            const id = ++sequence;
            watches.set(id, success);
            return id;
          },
          clearWatch(id) {
            calls.clear++;
            watches.delete(id);
          },
        },
      });
      window.__gpsAudit = {
        calls,
        active: () => watches.size,
        emit: () => {
          offset += 30000;
          index++;
          for (const success of watches.values()) success(fix());
        },
      };
    });
  }
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === new URL(base).origin
      ? route.continue()
      : route.abort(),
  );
  const ensure = (ok, message) => {
    if (!ok) throw new Error(message);
  };
  const session = page.locator(
    presentation === "page" ? '.bw-session-page[data-variant="page"]' : ".bw-unit-sheet",
  );
  const prefix = presentation === "page" ? "page-" : "";
  async function open(query) {
    await page.goto(base + (presentation === "page" ? "?page=1&" : "?unit=1&") + query);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    if (presentation === "page") {
      await page.locator('[data-session-audit-path="/plan"]').waitFor();
      await page
        .getByRole("button", { name: /^Otwórz trening:/ })
        .first()
        .click();
      await page.locator('[data-session-audit-path="/sesja/2026-11-02"]').waitFor();
      ensure(
        (await page.locator(".bw-unit-sheet").count()) === 0,
        "Plan opened a sheet instead of the actual session route",
      );
    } else await page.locator(".bw-qa-open-unit").click();
    await session.locator(".bw-session-head h1").waitFor();
    ensure(
      (await page.evaluate(() => window.__sessionAudit.receipts.length)) === 0,
      "Opening the plan or session caused a training write",
    );
  }
  async function inspect(name) {
    const dimensions = await (
      presentation === "page" ? session : session.locator(".bw-sheet-scroll")
    ).evaluate((el) => ({
      overflow: Math.max(
        el.scrollWidth - el.clientWidth,
        document.documentElement.scrollWidth - innerWidth,
      ),
      smallTargets: [...el.querySelectorAll("button")]
        .map((b) => {
          const box = b.getBoundingClientRect();
          return {
            label: b.getAttribute("aria-label") || b.textContent,
            width: box.width,
            height: box.height,
          };
        })
        // Translated sheets can report 43.9998px for a CSS 44px target.
        .filter(
          (box) => box.width > 0 && box.height > 0 && (box.width < 43.5 || box.height < 43.5),
        ),
    }));
    // Record every viewport before failing on layout, so one small control
    // does not prevent the remaining functional flows from being exercised.
    if (dimensions.overflow > 1) layoutProblems.push(name + ": horizontal overflow");
    if (dimensions.smallTargets.length)
      layoutProblems.push(
        name + ": touch target below 44px: " + JSON.stringify(dimensions.smallTargets),
      );
    await page.screenshot({ path: path.join(work, prefix + name + ".png") });
    reports.push({
      case: name,
      presentation,
      navigation:
        presentation === "page" ? "PlanScreen → /sesja/2026-11-02" : "isolated sheet launcher",
      ...dimensions,
      passed: dimensions.overflow <= 1 && dimensions.smallTargets.length === 0,
    });
  }
  try {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await open("kind=sprint&phase=preview");
      await session
        .locator(".bw-rplan-row button")
        .filter({ hasText: "Sprint lotny" })
        .first()
        .click();
      await session.locator(".bw-course-setup > summary").click();
      const field = session.locator("[data-training-field]");
      await field.waitFor();
      const text = await field.innerText();
      ensure(
        /15\s*m/.test(text) && /20\s*m/.test(text),
        "Flying sprint lost the 15m run-in or 20m work segment",
      );
      ensure(
        (await page.evaluate(() => window.__sessionAudit.receipts.length)) === 0,
        "Setup started a preview session",
      );
      await field.getByRole("button", { name: /Krok 3:/ }).click();
      ensure(
        (await field.locator('[data-field-route="work"]').getAttribute("data-field-active")) ===
          "true",
        "Sprint step did not highlight the work segment",
      );
      await field.scrollIntoViewIfNeeded();
      await inspect("sprint-ustawienie-" + width);
      await session.locator(".bw-course-setup > summary").click();
      await session.getByRole("button", { name: /^Rozpocznij trening/ }).click();
      await session.locator(".bw-sprint-timing > summary").click();
      await session.locator(".bw-sprint-stopwatch > summary").click();
      await session.getByRole("button", { name: "Start stopera", exact: true }).click();
      await page.waitForTimeout(1100);
      await session.getByRole("button", { name: "Zatrzymaj stoper", exact: true }).click();
      await session.getByRole("button", { name: "Użyj czasu", exact: true }).click();
      const input = session.getByRole("textbox", { name: "Czas sprintu w sekundach", exact: true });
      ensure(
        Number((await input.inputValue()).replace(",", ".")) > 0,
        "Stopwatch did not fill observed time",
      );
      const marks = await page.evaluate(() => ({
        starts: window.__sessionAudit.receipts.filter((r) => r.kind === "start").length,
        logs: JSON.parse(localStorage.getItem("session66:qa-rows") || "[]"),
      }));
      ensure(marks.starts === 1, "Explicit sprint start was duplicated");
      ensure(marks.logs.length === 0, "Stopwatch saved before the explicit save action");
      await inspect("sprint-narzedzia-" + width);

      await open("kind=football&phase=preview&drill=football_wall_first_touch");
      await session.locator(".bw-rplan-row button").first().click();
      await session.getByRole("button", { name: "Jak wykonać?", exact: true }).click();
      const football = session.locator("[data-training-field]");
      await football.waitFor();
      ensure(
        await football.locator("[data-field-action='pass']").count(),
        "Pass line absent from football diagram",
      );
      ensure(
        (await football.locator("[data-field-action]").count()) > 1,
        "Football sequence has only one undifferentiated line",
      );
      ensure(
        (await football.locator("animateMotion").count()) === 0,
        "Diagram auto-plays by default",
      );
      await football.getByRole("button", { name: /Krok 2/ }).click();
      await football.scrollIntoViewIfNeeded();
      await inspect("pilka-podanie-przyjecie-" + width);
      ensure(
        (await page.evaluate(() => window.__sessionAudit.receipts.length)) === 0,
        "Football instruction wrote a preview result",
      );
      if (presentation === "page") {
        await session.locator(".bw-session-head .bw-session-back").click();
        await page.locator('[data-session-audit-path="/plan"]').waitFor();
        ensure(
          (await page.locator(".bw-wk-open").count()) > 0,
          "Back did not return to the actual plan",
        );

        await open("kind=football&phase=active&drill=football_gate_dribble");
        await session.getByRole("button", { name: "Jak wykonać?", exact: true }).click();
        const carry = session.locator("[data-training-field]");
        await carry.waitFor();
        ensure(
          (await carry.locator("[data-field-marker='cone']").count()) > 0 &&
            (await carry.locator("[data-field-action='carry']").count()) > 0,
          "Active football instructions lost their cones or carrying route",
        );
        const directions = session.locator("details[aria-label='Kierunki i kolory']");
        await directions.locator("summary").click();
        ensure(
          (await directions.locator("animateMotion").count()) === 0,
          "Direction signals played before an explicit action",
        );
        await directions.getByRole("checkbox", { name: "Wyjście do wskazanej strefy" }).check();
        await directions.getByRole("img", { name: /^Sygnał:/ }).waitFor();
        await directions.scrollIntoViewIfNeeded();
        await inspect("pilka-kierunki-kolory-aktywna-" + width);
        await directions.getByRole("button", { name: "Odtwórz schemat", exact: true }).click();
        ensure(
          (await directions.locator("animateMotion").count()) === 1,
          "Explicit direction playback did not start the signal",
        );
        await directions.getByRole("button", { name: "Pauza", exact: true }).click();
        ensure(
          (await directions.locator("animateMotion").count()) === 0,
          "Pausing direction practice kept its animation running",
        );
        ensure(
          (await page.evaluate(() => window.__sessionAudit.receipts.length)) === 0,
          "Active football instruction wrote a training result",
        );
      }
    }
    for (const width of presentation === "page" ? [320, 390] : [390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const kind of ["run", "intervals"]) {
        await open(`kind=${kind}&phase=preview`);
        await session.getByRole("region", { name: "Plan biegu", exact: true }).waitFor();
        await inspect("bieg-plan-" + kind + (presentation === "page" ? "-" + width : ""));
        await open(`kind=${kind}&phase=active`);
        await session.getByRole("button", { name: "Bez GPS", exact: true }).click();
        await session.locator(".bw-run-guide, .bw-run-clock").first().waitFor();
        await inspect("bieg-narzedzia-" + kind + (presentation === "page" ? "-" + width : ""));
      }
    }
    if (presentation === "page") {
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        await open("kind=strength&phase=active");
        await session.getByRole("button", { name: "Pozostałe ćwiczenia", exact: true }).click();
        await session
          .locator(".bw-rplan-row button")
          .filter({ hasText: /Przysiad/ })
          .first()
          .click();
        await session
          .getByRole("textbox", { name: "Seria 1: ciężar w kg", exact: true })
          .fill("40");
        await session.getByRole("textbox", { name: "Seria 1: powtórzenia", exact: true }).fill("8");
        const reserve = session.getByRole("button", { name: "Seria 1: zapas 3", exact: true });
        if (await reserve.count()) await reserve.click();
        await inspect("sila-zapis-serii-" + width);
        await session.getByRole("button", { name: "Zatwierdź serię 1", exact: true }).click();
        await session.locator(".bw-rest-screen").waitFor();
        const saved = await page.evaluate(() =>
          JSON.parse(localStorage.getItem("session66:qa-rows") || "[]"),
        );
        ensure(
          saved.length === 1 &&
            saved[0].weight_kg === 40 &&
            saved[0].reps === 8 &&
            saved[0].set_number === 1,
          "Strength fields did not save one correctly numbered set",
        );
        await inspect("sila-przerwa-po-serii-" + width);

        await open("kind=advanced&phase=preview");
        const linked = session.locator('.bw-rplan-card[data-linked="true"]').first();
        await linked.waitFor();
        ensure(
          /Superseria/.test(await linked.innerText()),
          "Generated advanced session lost its superset grouping",
        );
        const labels = await page.evaluate(() => {
          const section = window.__sessionAudit.session.structuredSections.find((item) =>
            item.blocks.some((block) => block.blockType === "superset"),
          );
          return section.blocks
            .find((block) => block.blockType === "superset")
            .exercises.map((exercise) => exercise.label);
        });
        ensure(
          labels.length === 2 && labels[0]?.endsWith("1") && labels[1]?.endsWith("2"),
          "Engine superset has no distinct exercise labels",
        );
        await linked.locator(".bw-rplan-row button").first().click();
        ensure(
          (await page.evaluate(() => window.__sessionAudit.receipts.length)) === 0,
          "Browsing a superset started the session",
        );
        await inspect("superseria-podglad-" + width);
        await session.getByRole("button", { name: /^Rozpocznij trening/ }).click();
        const round = session.getByRole("region", {
          name: "Superseria prowadzona rundami",
          exact: true,
        });
        await round.waitFor();
        ensure(
          (await round.locator(".bw-runner-position").innerText()).includes(labels[0]),
          "Superset did not start on the first exercise",
        );
        // The generated pair may start with a loaded lift or an isometric
        // hold. Use the fields appropriate to its actual prescription.
        const pairKg = session.getByRole("textbox", { name: "Seria 1: ciężar w kg", exact: true });
        const pairReps = session.getByRole("textbox", {
          name: "Seria 1: powtórzenia",
          exact: true,
        });
        const pairSeconds = session.getByRole("textbox", {
          name: "Seria 1: czas w sekundach",
          exact: true,
        });
        ensure(
          (await pairReps.count()) + (await pairSeconds.count()) === 1,
          "Superset exercise has no unambiguous repetitions or duration input",
        );
        if (await pairKg.count()) await pairKg.fill("40");
        if (await pairReps.count()) await pairReps.fill("5");
        if (await pairSeconds.count()) await pairSeconds.fill("20");
        const pairReserve = session.getByRole("button", { name: "Seria 1: zapas 3", exact: true });
        if (await pairReserve.count()) await pairReserve.click();
        await session.getByRole("button", { name: "Zatwierdź serię 1", exact: true }).click();
        await session.locator(".bw-rest-screen").waitFor();
        await session.locator(".bw-runner-dock .bw-runner-primary").click();
        await round.waitFor();
        const next = await round.locator(".bw-runner-position").innerText();
        ensure(
          next.includes(labels[1]) && /Runda 1 z/.test(next),
          "Superset skipped the second exercise or advanced the round too early",
        );
        await inspect("superseria-drugie-cwiczenie-" + width);

        await open("kind=run&phase=active");
        await session.getByRole("button", { name: "Z GPS", exact: true }).click();
        await session.getByRole("heading", { name: "Bieg z GPS", exact: true }).waitFor();
        ensure(
          (await page.evaluate(
            () => window.__gpsAudit.calls.current + window.__gpsAudit.calls.watch,
          )) === 0,
          "GPS requested a position before the explicit start",
        );
        await session.getByRole("button", { name: "Start GPS", exact: true }).click();
        await session.locator(".bw-run-live-stats").waitFor();
        for (let index = 0; index < 3; index++) {
          await page.evaluate(() => window.__gpsAudit.emit());
          await page.waitForTimeout(600);
        }
        const gps = await page.evaluate(() => ({
          calls: window.__gpsAudit.calls,
          active: window.__gpsAudit.active(),
        }));
        ensure(
          gps.calls.current === 1 && gps.calls.watch === 1 && gps.active === 1,
          "GPS started duplicate location watches",
        );
        const map = session.getByRole("region", { name: "Mapa biegu na żywo", exact: true });
        await map.waitFor();
        await map.getByRole("img", { name: /^(Mapa trasy biegu|Kształt trasy biegu)$/ }).waitFor();
        await map.scrollIntoViewIfNeeded();
        await inspect("bieg-gps-mapa-" + width);
        const stats = await session.locator(".bw-run-live-stats").innerText();
        ensure(
          /\d+:\d{2}/.test(stats) && /\d+\s*(?:m|km)/.test(stats) && /\d+:\d{2}\/km/.test(stats),
          "GPS time, distance or pace per kilometre is absent from the live readout",
        );
        ensure(
          (await page.evaluate(() => window.__sessionAudit.receipts.length)) === 0,
          "GPS saved a result without confirmation",
        );
        await session.locator(".bw-session-head .bw-session-back").click();
        await page.locator('[data-session-audit-path="/plan"]').waitFor();
        ensure(
          (await page.evaluate(() => window.__gpsAudit.active())) === 0,
          "Leaving the GPS page kept a location watch running",
        );
      }
    }
    ensure(errors.length === 0, errors.join("; "));
    ensure(layoutProblems.length === 0, layoutProblems.join("\n"));
    return reports;
  } catch (error) {
    await page.screenshot({ path: path.join(work, prefix + "field-failure.png"), fullPage: true });
    await fs.writeFile(
      path.join(work, prefix + "field-failure.json"),
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
      path.join(work, prefix + "field-results.json"),
      JSON.stringify({ presentation, reports, errors, layoutProblems }, null, 2),
    );
    await page.close();
  }
}
