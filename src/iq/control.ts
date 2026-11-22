/**
 * Sterowanie zawodnikiem w IQ (czysta matematyka): kierunek joysticka = kierunek biegu na ekranie, od razu.
 * Kierunek w układzie boiska: wektor (cos α, sin α), x – wzdłuż boiska (atak w stronę x = 105), y – w poprzek.
 * Kamera patrzy zawsze w kierunku ataku (cam = 0): joystick „do góry” to bieg do przodu na ekranie, „w prawo” to bieg w prawo,
 * więc nic nie obraca się razem z zawodnikiem (brak biegania w kółko i brak opóźnienia kamery za kierunkiem).
 *  - zawodnik rozpędza się i hamuje bardzo szybko (ok. 0,17 s do pełnej prędkości), prędkość zależy od wychylenia,
 *  - patrzy w kierunku biegu (obrót ok. 16 rad/s), a po puszczeniu joysticka zachowuje ostatni kierunek (służy do celowania podania).
 */
export const SPEED_MAX = 6.5;
export const ACCEL = 38; // m/s²: rozpęd (0 → 6,5 m/s w ok. 0,17 s)
export const BRAKE = 60; // m/s²: hamowanie i zawracanie
export const TURN_RATE = 16; // 1/s: jak szybko zawodnik obraca się do kierunku biegu
export const CAM_FOLLOW = 6; // 1/s: powrót kamery do kierunku ataku (po zamachu, w intro)
const DEAD = 0.08;

export interface Drive {
  x: number; y: number;
  /** Kierunek zawodnika (rad). */
  heading: number;
  /** Prędkość (m/s). */
  speed: number;
  /** Kierunek kamery (rad): 0 = w stronę ataku. */
  cam: number;
  /** Wektor prędkości (m/s) w układzie boiska. */
  vx: number; vy: number;
  /** Zryw zwodu (m/s): dodatkowa prędkość, która szybko wygasa (krok w bok, obrót). */
  bx: number; by: number;
}

export const newDrive = (x: number, y: number): Drive => ({ x, y, heading: 0, speed: 0, cam: 0, vx: 0, vy: 0, bx: 0, by: 0 });
export const BURST_DECAY = 5; // 1/s: zryw 9 m/s daje ok. 1,8 m

/** Zryw zwodu w kierunku (dx, dy) – wektor jednostkowy; power w m/s. */
export function burst(s: Drive, dx: number, dy: number, power: number): void {
  const l = Math.hypot(dx, dy) || 1;
  s.bx = (dx / l) * power; s.by = (dy / l) * power;
}

export const angDiff = (to: number, from: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export interface Bounds { minX: number; maxX: number; minY: number; maxY: number }

/** Jeden krok sterowania. stick: r – wychylenie w prawo (−1…1), f – do przodu (−1…1). Zwraca przesunięcie w tej klatce. */
export function drive(s: Drive, stick: { r: number; f: number }, dt: number, b: Bounds): number {
  const mag0 = Math.hypot(stick.r, stick.f);
  // martwa strefa na długości wychylenia (nie na osiach): kierunek zostaje dokładny, prędkość rośnie od zera
  const mag = mag0 < DEAD ? 0 : Math.min(1, (mag0 - DEAD) / (1 - DEAD));
  const dirx = mag0 > 0 ? stick.f / mag0 : 0, diry = mag0 > 0 ? stick.r / mag0 : 0;
  const tx = dirx * mag * SPEED_MAX, ty = diry * mag * SPEED_MAX;
  // przyspieszenie ograniczone, ale duże; zawracanie i hamowanie jeszcze szybsze
  let dvx = tx - s.vx, dvy = ty - s.vy;
  const dl = Math.hypot(dvx, dvy);
  const braking = s.vx * tx + s.vy * ty < 0 || Math.hypot(tx, ty) < Math.hypot(s.vx, s.vy);
  const cap = (braking ? BRAKE : ACCEL) * dt;
  if (dl > cap) { dvx *= cap / dl; dvy *= cap / dl; }
  s.vx += dvx; s.vy += dvy;
  if (mag === 0 && Math.hypot(s.vx, s.vy) < 0.05) { s.vx = 0; s.vy = 0; }
  const wantX = s.x + (s.vx + s.bx) * dt, wantY = s.y + (s.vy + s.by) * dt;
  const nx = Math.max(b.minX, Math.min(b.maxX, wantX)), ny = Math.max(b.minY, Math.min(b.maxY, wantY));
  if (nx !== wantX) { s.vx = 0; s.bx = 0; }
  if (ny !== wantY) { s.vy = 0; s.by = 0; }
  const moved = Math.hypot(nx - s.x, ny - s.y);
  s.x = nx; s.y = ny;
  const k = Math.exp(-dt * BURST_DECAY); s.bx *= k; s.by *= k;
  if (Math.hypot(s.bx, s.by) < 0.05) { s.bx = 0; s.by = 0; }
  s.speed = Math.hypot(s.vx + s.bx, s.vy + s.by);
  // patrzy w kierunku, w którym jest prowadzony joystick (od razu), a nie w stronę dopiero co osiągniętej prędkości
  if (mag > 0) s.heading += angDiff(Math.atan2(diry, dirx), s.heading) * (1 - Math.exp(-dt * TURN_RATE));
  followCamera(s, dt);
  return moved;
}

/** Kamera wraca do kierunku ataku (zwykle już tam jest). */
export function followCamera(s: Drive, dt: number): void {
  s.cam += angDiff(0, s.cam) * (1 - Math.exp(-dt * CAM_FOLLOW));
}

/** Obrót zawodnika do wskazanego kierunku (np. do celu podania przed kopnięciem); zawodnik staje. */
export function turnTo(s: Drive, target: number, dt: number, rate = 12): void {
  s.heading += angDiff(target, s.heading) * (1 - Math.exp(-dt * rate));
  const k = Math.exp(-dt * 10);
  s.vx *= k; s.vy *= k; s.speed = Math.hypot(s.vx, s.vy);
  followCamera(s, dt);
}
