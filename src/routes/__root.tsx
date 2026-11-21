import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import appCss from "../index.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Ballwise" },
      { name: "theme-color", content: "#eef4fb" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
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
