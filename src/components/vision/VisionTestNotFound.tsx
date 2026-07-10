import { createFileRoute, Link } from "@tanstack/react-router";
import { VisionGuard } from "@/components/vision/VisionGuard";

/** Wspólny widok dla nieznanego testu. */
export function VisionTestNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-lg font-semibold text-foreground">Nie znaleziono testu</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Ten test nie istnieje lub został przeniesiony.
      </p>
      <Link to="/vision-lab" className="mt-4 text-sm font-medium text-primary">
        Wróć do Vision Lab
      </Link>
    </div>
  );
}

export { VisionGuard, createFileRoute };
