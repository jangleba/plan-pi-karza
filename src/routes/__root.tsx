import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import appCss from "../index.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "BallWise" },
      { name: "theme-color", content: "#f7f8fa" },
      // PWA: ikona na ekranie głównym otwiera aplikację bez paska przeglądarki (iOS czyta też manifest, te znaczniki to uzupełnienie)
      { name: "application-name", content: "BallWise" },
      { name: "apple-mobile-web-app-title", content: "BallWise" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "format-detection", content: "telephone=no" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: () => <Outlet />,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pl">
      <head>
        <HeadContent />
        {/* tło od pierwszej klatki: bez białego błysku, zanim załadują się style i skrypty */}
        <style dangerouslySetInnerHTML={{ __html: "html,body{background:#f7f8fa;margin:0}" }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
