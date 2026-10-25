import { access, stat, readFile, writeFile } from "node:fs/promises";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import process from "node:process";
import { loadEnv } from "vite";

const configured = { ...loadEnv("production", process.cwd(), ""), ...process.env };
const bundleId = configured.BALLWISE_IOS_BUNDLE_ID?.trim() ?? "";
const associatedDomain = configured.BALLWISE_IOS_ASSOCIATED_DOMAIN?.trim() ?? "";
const teamId = configured.BALLWISE_IOS_TEAM_ID?.trim() ?? "";
const bundleIdPattern = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9-]+){2,}$/;
const syncOnly = process.argv.includes("--sync-only");
const execFileAsync = promisify(execFile);

function fail(message) {
  console.error(`\nBallWise iOS: ${message}\n`);
  process.exit(1);
}

function run(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
      env: { ...process.env, ...extraEnv },
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} zakończył się kodem ${code ?? signal ?? "unknown"}`));
    });
  });
}

async function setPlistValue(plistPath, key, value) {
  try {
    await run("/usr/libexec/PlistBuddy", ["-c", `Set :${key} ${value}`, plistPath]);
  } catch {
    await run("/usr/libexec/PlistBuddy", ["-c", `Add :${key} string ${value}`, plistPath]);
  }
}

if (process.platform !== "darwin") {
  fail("projekt iOS można utworzyć i otworzyć wyłącznie na macOS z Xcode.");
}

if (!bundleId || !bundleIdPattern.test(bundleId) || bundleId.includes("placeholder")) {
  fail(
    "ustaw prawdziwy identyfikator: BALLWISE_IOS_BUNDLE_ID=pl.twojafirma.ballwise npm run ios:setup",
  );
}

try {
  await run("npm", ["run", "release:check"], configured);
  await run("npm", ["run", "build:mobile"], { BALLWISE_IOS_BUNDLE_ID: bundleId });
  await access("dist/client/index.html");
  const entry = await stat("dist/client/index.html");
  if (!entry.isFile() || entry.size === 0)
    fail("mobilny index.html nie został poprawnie zbudowany.");

  let iosExists = true;
  try {
    await access("ios/App/App.xcodeproj");
  } catch {
    iosExists = false;
  }

  if (syncOnly && !iosExists) {
    fail("brakuje projektu ios/. Najpierw uruchom npm run ios:setup.");
  }
  if (!iosExists) await run("npx", ["cap", "add", "ios"], { BALLWISE_IOS_BUNDLE_ID: bundleId });
  await run("npx", ["cap", "sync", "ios"], { BALLWISE_IOS_BUNDLE_ID: bundleId });

  const infoPlist = "ios/App/App/Info.plist";
  await access(infoPlist);
  await setPlistValue(
    infoPlist,
    "NSCameraUsageDescription",
    "BallWise używa kamery do nagrywania prób sportowych w Lab i odczytu kodu produktu w Fuel. Dostęp jest uruchamiany po Twoim wyborze.",
  );
  await setPlistValue(
    infoPlist,
    "NSLocationWhenInUseUsageDescription",
    "BallWise mierzy czas i dystans biegu po naciśnięciu Start. Podczas aktywnego biegu pomiar może działać przy zablokowanym ekranie. Współrzędne nie są zapisywane w historii.",
  );
  // A capability is generated explicitly; no Always permission or microphone is requested.
  let modes = "";
  try {
    modes = (
      await execFileAsync("/usr/libexec/PlistBuddy", ["-c", "Print :UIBackgroundModes", infoPlist])
    ).stdout;
  } catch {
    await run("/usr/libexec/PlistBuddy", ["-c", "Add :UIBackgroundModes array", infoPlist]);
  }
  if (!/\blocation\b/.test(modes))
    await run("/usr/libexec/PlistBuddy", [
      "-c",
      "Add :UIBackgroundModes:0 string location",
      infoPlist,
    ]);
  const entitlementsPath = "ios/App/App/App.entitlements";
  let existingEntitlements = null;
  try {
    existingEntitlements = await readFile(entitlementsPath, "utf8");
  } catch {
    /* first setup */
  }
  if (existingEntitlements !== null) {
    if (!existingEntitlements.includes(`<string>applinks:${associatedDomain}</string>`))
      fail(
        `Istniejące App.entitlements zachowano. Dodaj applinks:${associatedDomain} do Associated Domains w Xcode i ponów synchronizację.`,
      );
  } else {
    await writeFile(
      entitlementsPath,
      `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>com.apple.developer.associated-domains</key><array><string>applinks:${associatedDomain}</string></array></dict></plist>\n`,
    );
  }
  const pbxPath = "ios/App/App.xcodeproj/project.pbxproj";
  let project = await readFile(pbxPath, "utf8");
  if (!project.includes("CODE_SIGN_ENTITLEMENTS = App/App.entitlements;")) {
    const anchor = "INFOPLIST_FILE = App/Info.plist;";
    if (!project.includes(anchor))
      fail(
        "Nie rozpoznano formatu projektu Xcode. Podepnij App.entitlements w target App i sprawdź konfigurację przed archiwizacją.",
      );
    project = project.replaceAll(
      anchor,
      `${anchor}\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = App/App.entitlements;`,
    );
    await writeFile(pbxPath, project);
  }
  try {
    await access("ios/App/App/PrivacyInfo.xcprivacy");
  } catch {
    await writeFile(
      "ios/App/App/PrivacyInfo.xcprivacy",
      await readFile("ios-templates/PrivacyInfo.xcprivacy.template", "utf8"),
    );
  }
  // Copying is not target membership: the setup report explicitly requires the Xcode check.
  await writeFile(
    "ios/App/ballwise-capabilities.json",
    JSON.stringify(
      {
        bundleId,
        associatedDomain,
        teamId: teamId || null,
        generatedAt: new Date().toISOString(),
        requiredTargetFiles: ["App/App.entitlements", "App/PrivacyInfo.xcprivacy"],
        hardwareValidated: false,
      },
      null,
      2,
    ),
  );

  console.log(`\nBallWise iOS zsynchronizowany dla ${bundleId}.`);
  console.log("Następny krok: npm run ios:open\n");
  console.log(
    "Sprawdź Team/signing, membership PrivacyInfo.xcprivacy, raport prywatności SDK i AASA na swojej domenie. Sam sync nie jest testem iPhone/TestFlight.",
  );
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
