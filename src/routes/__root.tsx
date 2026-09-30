import {
  Outlet,
  Link,
  createRootRoute,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import visualSystemCss from "../styles/ballwise-visual-system.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { LoadwiseProvider } from "../lib/loadwise/store";
import { AuthProvider } from "../lib/loadwise/auth";
import { Toaster } from "../components/ui/sonner";
import { LEGAL_RELEASE_BLOCKED } from "../lib/loadwise/legal";
import { useDuplicateNavigationGuard } from "../lib/useDuplicateNavigationGuard";
import { AppFrame } from "../components/loadwise/AppFrame";
import { ActivityExitProvider } from "../components/loadwise/ActivityExitGuard";
import { Button } from "../components/ui/button";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-sm text-muted-foreground">404</p>
        <h1 className="bw-page-title mt-2">Nie znaleziono strony</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ta strona nie istnieje albo została przeniesiona.
        </p>
        <div className="mt-6">
          <Button asChild>
            <Link to="/">Wróć na start</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="bw-page-title text-foreground">Nie udało się wczytać strony</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Coś poszło nie tak. Spróbuj ponownie albo wróć na stronę startową.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            Spróbuj ponownie
          </Button>
          <Button asChild variant="outline">
            <Link to="/" onClick={reset}>
              Wróć na start
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: "BallWise — mądrzejsze decyzje treningowe w piłce" },
      {
        name: "description",
        content:
          "BallWise podpowiada, co trenować dziś, dlaczego i jak mocno — na podstawie wieku, pozycji, celu i gotowości.",
      },
      { name: "author", content: "BallWise" },
      { name: "theme-color", content: "#f6f8fb" },
      { property: "og:title", content: "BallWise" },
      {
        property: "og:description",
        content: "Decyzje treningowe w piłce nożnej, dopasowane do Ciebie.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      {
        rel: "preload",
        href: "/fonts/source-sans-3-upright.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "stylesheet",
        href: visualSystemCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  useDuplicateNavigationGuard();

  if (LEGAL_RELEASE_BLOCKED) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md p-6 text-center">
          <h1 className="bw-page-title">Publikacja BallWise jest zablokowana</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Uzupełnij dane administratora, dane rejestrowe, kontakt, retencję, region danych i
            warunki subskrypcji w konfiguracji środowiska produkcyjnego.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AuthProvider>
      <LoadwiseProvider>
        <ActivityExitProvider>
          <AppFrame>
            <Outlet />
          </AppFrame>
        </ActivityExitProvider>
        <Toaster position="top-center" />
      </LoadwiseProvider>
    </AuthProvider>
  );
}
