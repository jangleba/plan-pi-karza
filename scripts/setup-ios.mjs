import { access, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import process from "node:process";

const bundleId = process.env.BALLWISE_IOS_BUNDLE_ID?.trim() ?? "";
const bundleIdPattern = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9-]+){2,}$/;
const syncOnly = process.argv.includes("--sync-only");

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
  if (!iosExists) await run("npx", ["cap", "add", "ios"]);
  await run("npx", ["cap", "sync", "ios"]);

  const infoPlist = "ios/App/App/Info.plist";
  await access(infoPlist);
  await setPlistValue(
    infoPlist,
    "NSCameraUsageDescription",
    "BallWise używa kamery 240 FPS wyłącznie do pomiaru testów sportowych.",
  );

  console.log(`\nBallWise iOS zsynchronizowany dla ${bundleId}.`);
  console.log("Następny krok: npm run ios:open\n");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
