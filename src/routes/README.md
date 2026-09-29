# Routes

TanStack Start uses file-based routing. The root layout is `__root.tsx`; it wraps
pages and preserves `<Outlet />`. Do not introduce Next.js or Remix layout
conventions. `src/routeTree.gen.ts` is generated; do not edit it by hand.

| File | Meaning |
| --- | --- |
| `index.tsx` | `/` |
| `_tabs.tsx` | Pathless tab layout |
| `_tabs.plan.tsx` | `/plan` inside the tab layout |
| `sesja.$date.tsx` | `/sesja/:date` |
| `users/$id.tsx` | Dynamic segment (bare `$`, no braces) |
| `posts/{-$category}.tsx` | Optional segment |
| `files/$.tsx` | Splat, available as `_splat` |
| `[.mcp]/list-tools.ts` | Escaped literal dot in the server route path |
| `-sesja.$date.test.ts` | Ignored by the route generator |

Route modules may be `.ts` or `.tsx`. Prefix colocated tests and helpers with
`-`, the generator's ignore prefix; `.test.ts` alone does not exclude a file.
Prefer shared helpers/components outside this directory. Markdown is documentation,
not a route. Keep the web and mobile configurations consistent when changing
routing rules. The router uses `defaultPreload: "intent"` for navigation preloading.
