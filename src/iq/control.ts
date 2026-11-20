/**
 * Sterowanie „jak w samochodzie” dla IQ (czysta matematyka).
 * Kierunek w układzie boiska: wektor (cos α, sin α), x – wzdłuż boiska, y – w poprzek;
 * kamera jest za plecami, więc prawa strona ekranu to wzrost α.
 *  - joystick do przodu: bieg przed siebie, do tyłu: zatrzymanie,
 *  - joystick w bok: skręt (w miejscu obrót), bez „strafe” – dzięki temu kamera podążająca za kierunkiem
 *    nie powoduje biegania w kółko (obrót jest sterowany prędkością kątową, nie kierunkiem docelowym),
 *  - kamera dogania kierunek zawodnika płynnie.
 */
export const SPEED_MAX = 6.5;
export const TURN_MAX = 3.4; // rad/s przy pełnym wychyleniu w bok
export const CAM_FOLLOW = 13; // 1/s – szybkość doganiania kierunku przez kamerę (przy pełnym skręcie opóźnienie ≈ 15°)
const DEAD = 0.1;

export interface Drive {
  x: number; y: number;
  /** Kierunek zawodnika (rad). */
  heading: number;
  /** Prędkość (m/s). */
  speed: number;
  /** Kierunek kamery (rad). */
  cam: number;
}

export const angDiff = (to: number, from: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export interface Bounds { minX: number; maxX: number; minY: number; maxY: number }

/** Jeden krok sterowania. stick: r – wychylenie w prawo (−1…1), f – do przodu (−1…1). Zwraca przesunięcie w tej klatce. */
export function drive(s: Drive, stick: { r: number; f: number }, dt: number, b: Bounds): number {
  const dz = (v: number) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));
  const r = dz(stick.r), f = dz(stick.f);
  // skręt wolniejszy w pełnym biegu (promień łuku rośnie z prędkością)
  const turn = r * TURN_MAX * (1 - 0.35 * Math.min(1, s.speed / SPEED_MAX));
  s.heading += turn * dt;
  const target = SPEED_MAX * Math.max(0, Math.min(1, f));
  s.speed += (target - s.speed) * (1 - Math.exp(-dt * (target > s.speed ? 6 : 9)));
  const dx = Math.cos(s.heading) * s.speed * dt, dy = Math.sin(s.heading) * s.speed * dt;
  const nx = Math.max(b.minX, Math.min(b.maxX, s.x + dx)), ny = Math.max(b.minY, Math.min(b.maxY, s.y + dy));
  const moved = Math.hypot(nx - s.x, ny - s.y);
  s.x = nx; s.y = ny;
  followCamera(s, dt);
  return moved;
}

/** Kamera dogania kierunek zawodnika (po najkrótszym łuku). */
export function followCamera(s: Drive, dt: number): void {
  s.cam += angDiff(s.heading, s.cam) * (1 - Math.exp(-dt * CAM_FOLLOW));
}

/** Obrót zawodnika do wskazanego kierunku (np. do celu podania przed kopnięciem). */
export function turnTo(s: Drive, target: number, dt: number, rate = 12): void {
  s.heading += angDiff(target, s.heading) * (1 - Math.exp(-dt * rate));
  s.speed *= Math.exp(-dt * 10);
  followCamera(s, dt);
}
