// Capacitor sync updates the web bundle and plugins, not the existing Xcode
// target's product identity. Check every app build configuration before sync.
const appConfigurations = (project) => {
  const blocks = [...project.matchAll(/buildSettings = \{([\s\S]*?)\n([\t ]*)\};/g)];
  const app = blocks.filter((match) =>
    /\bINFOPLIST_FILE\s*=\s*"?App\/Info\.plist"?\s*;/.test(match[1]),
  );
  if (!app.length) throw new Error("Nie rozpoznano konfiguracji targetu App w projekcie Xcode.");
  return app;
};

export function validateIosAppIdentity(project, bundleId) {
  for (const match of appConfigurations(project)) {
    const identity = match[1].match(
      /\bPRODUCT_BUNDLE_IDENTIFIER\s*=\s*(?:"([^"]+)"|([^;\s]+))\s*;/,
    );
    const actual = identity?.[1] ?? identity?.[2];
    if (actual !== bundleId)
      throw new Error(
        "BALLWISE_IOS_BUNDLE_ID nie odpowiada każdej konfiguracji targetu App. Uzgodnij Bundle Identifier w Xcode przed synchronizacją; istniejącego identyfikatora nie zmieniono.",
      );
  }
}

export function configureIosAppEntitlements(project, bundleId) {
  validateIosAppIdentity(project, bundleId);
  let result = project;
  for (const match of appConfigurations(project)) {
    const existing = match[1].match(/\bCODE_SIGN_ENTITLEMENTS\s*=\s*(?:"([^"]+)"|([^;\s]+))\s*;/);
    if (existing) {
      if ((existing[1] ?? existing[2]) !== "App/App.entitlements")
        throw new Error(
          "Target App używa innego pliku entitlements. Zachowano konfigurację; uzgodnij Associated Domains i CODE_SIGN_ENTITLEMENTS w Xcode.",
        );
      continue;
    }
    const updated = match[0].replace(
      /\bINFOPLIST_FILE\s*=\s*"?App\/Info\.plist"?\s*;/,
      (anchor) => `${anchor}\n${match[2]}\tCODE_SIGN_ENTITLEMENTS = App/App.entitlements;`,
    );
    result = result.replace(match[0], updated);
  }
  return result;
}
