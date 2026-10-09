import { Capacitor, registerPlugin } from "@capacitor/core";
import { parseCourseMeasurement, validCourseTarget } from "./model";

interface CourseMeasurePlugin {
  measureCourseCapabilities(): Promise<{ supported: boolean }>;
  measureCourse(options: { targetMeters: number }): Promise<unknown>;
}

// Reuse the installed native package. No dependency on the Lab UI or Lab results.
const NativeCourseMeasure =
  registerPlugin<CourseMeasurePlugin>("BallWiseCamera");

export function supportsNativeCourseMeasure(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export async function measureCourse(targetMeters: number) {
  if (!validCourseTarget(targetMeters))
    throw new Error("Wpisz dystans od 1 do 30 metrów.");
  if (!supportsNativeCourseMeasure()) {
    throw new Error(
      "Miarka kamery działa w aplikacji BallWise na iPhone. Odcinek możesz odmierzyć taśmą.",
    );
  }
  const capability = await NativeCourseMeasure.measureCourseCapabilities();
  if (!capability.supported)
    throw new Error(
      "Ten iPhone nie obsługuje miarki AR. Odcinek możesz odmierzyć taśmą.",
    );
  return parseCourseMeasurement(
    await NativeCourseMeasure.measureCourse({ targetMeters }),
    targetMeters,
  );
}

export function courseMeasureError(error: unknown): string | null {
  const code =
    error && typeof error === "object" && "code" in error ? error.code : null;
  if (code === "MEASURE_CANCELLED") return null;
  if (code === "UNIMPLEMENTED" || code === "UNAVAILABLE") {
    return "Miarka wymaga aktualnego buildu aplikacji iPhone z modułem natywnym.";
  }
  if (code === "CAMERA_PERMISSION_DENIED") {
    return "Włącz dostęp do kamery dla BallWise w ustawieniach iPhone’a.";
  }
  return error instanceof Error
    ? error.message
    : "Nie udało się otworzyć miarki. Spróbuj ponownie.";
}
