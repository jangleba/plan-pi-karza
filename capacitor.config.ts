import type { CapacitorConfig } from "@capacitor/cli";

const configuredBundleId = process.env.BALLWISE_IOS_BUNDLE_ID?.trim();

const config: CapacitorConfig = {
  // The setup script refuses to create/sync iOS with this placeholder.
  appId: configuredBundleId || "pl.ballwise.placeholder",
  appName: "BallWise",
  webDir: "dist/client",
  server: {
    iosScheme: "capacitor",
  },
  ios: {
    contentInset: "automatic",
  },
};

export default config;
