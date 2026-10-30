import { Capacitor } from "@capacitor/core";
import { lazy, Suspense } from "react";

const Bridge = lazy(() =>
  import("./FuelReminderBridge").then((module) => ({ default: module.FuelReminderBridge })),
);

/** Native notification planning has no work to do in a browser or Lovable preview. */
export function NativeFuelReminderBridge() {
  return Capacitor.isNativePlatform() ? (
    <Suspense fallback={null}>
      <Bridge />
    </Suspense>
  ) : null;
}
