import { Link } from "@tanstack/react-router";

/** Wspólny widok dla testu, który nie jest już aktywny w Vision Lab. */
export function VisionTestNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-lg font-semibold text-foreground">Test nieaktywny</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Ten test nie jest już aktywny w Vision Lab.
      </p>
      <Link
        to="/vision-lab"
        className="mt-4 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground active:scale-95"
      >
        Wróć do Vision Lab
      </Link>
    </div>
  );
}
