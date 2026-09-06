import type { RoutePoint } from "@/lib/running/types";

function projectRoute(route: RoutePoint[], width: number, height: number, padding: number) {
  if (route.length === 0) return [];
  const averageLat = route.reduce((sum, point) => sum + point.lat, 0) / route.length;
  const xScale = Math.max(0.1, Math.cos((averageLat * Math.PI) / 180));
  const raw = route.map((point) => ({ x: point.lng * xScale, y: -point.lat }));
  const minX = Math.min(...raw.map((point) => point.x));
  const maxX = Math.max(...raw.map((point) => point.x));
  const minY = Math.min(...raw.map((point) => point.y));
  const maxY = Math.max(...raw.map((point) => point.y));
  const spanX = Math.max(maxX - minX, 0.00001);
  const spanY = Math.max(maxY - minY, 0.00001);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const usedWidth = spanX * scale;
  const usedHeight = spanY * scale;
  const offsetX = (width - usedWidth) / 2;
  const offsetY = (height - usedHeight) / 2;
  return raw.map((point) => ({
    x: offsetX + (point.x - minX) * scale,
    y: offsetY + (point.y - minY) * scale,
  }));
}

export function RouteMap({ route, compact = false }: { route: RoutePoint[]; compact?: boolean }) {
  const width = 640;
  const height = compact ? 220 : 320;
  const points = projectRoute(route, width, height, 24);
  const path = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const start = points[0];
  const finish = points.at(-1);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-muted/50">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={compact ? "h-36 w-full" : "h-52 w-full"}
        role="img"
        aria-label={
          route.length > 1
            ? "Prywatny zarys przebytej trasy, bez mapy zewnętrznego dostawcy"
            : "Brak zarejestrowanej trasy"
        }
      >
        <defs>
          <linearGradient id="route-gradient" x1="0" x2="1">
            <stop offset="0" stopColor="var(--color-primary)" stopOpacity="0.65" />
            <stop offset="1" stopColor="var(--color-primary)" />
          </linearGradient>
          <pattern id="route-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeOpacity="0.08" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#route-grid)" className="text-foreground" />
        {path && (
          <polyline
            points={path}
            fill="none"
            stroke="url(#route-gradient)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {start && (
          <circle
            cx={start.x}
            cy={start.y}
            r="9"
            fill="var(--color-background)"
            stroke="var(--color-primary)"
            strokeWidth="6"
          />
        )}
        {finish && (
          <circle
            cx={finish.x}
            cy={finish.y}
            r="10"
            fill="var(--color-primary)"
            stroke="var(--color-background)"
            strokeWidth="4"
          />
        )}
      </svg>
      <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        <span>Prywatny ślad</span>
        <span>Bez wysyłania pozycji do map zewnętrznych</span>
      </div>
    </div>
  );
}
