/**
 * Widok poziomy w IQ (czysta matematyka). Gra otwiera się na pełnym ekranie w poziomie: gdzie system na to pozwala (Android),
 * blokuje orientację, a tam gdzie nie (iPhone) obraca widok o 90° w prawo w CSS. W obróconym widoku współrzędne dotyku
 * (ekran) trzeba przeliczyć na układ elementu: oś x elementu biegnie w dół ekranu, oś y w lewo.
 */
export interface Box { left: number; top: number; width: number; height: number }

/** Czy trzeba obrócić widok CSS: ekran jest w pionie, a gra ma być pozioma. */
export const needsRotation = (viewW: number, viewH: number): boolean => viewH > viewW;

/** Punkt ekranu → układ elementu. `rect` to getBoundingClientRect elementu (po obrocie: szerokość = lokalna wysokość). */
export function toLocal(rot: boolean, rect: Box, clientX: number, clientY: number): { x: number; y: number } {
  const u = clientX - rect.left, v = clientY - rect.top;
  return rot ? { x: v, y: rect.width - u } : { x: u, y: v };
}

/** Przesunięcie na ekranie → przesunięcie w układzie elementu. */
export const toLocalDelta = (rot: boolean, dx: number, dy: number): { x: number; y: number } => (rot ? { x: dy, y: -dx } : { x: dx, y: dy });

/** Styl nakładki na cały ekran: w pionie obrócona o 90° w prawo i dopasowana do okna. */
export function overlayStyle(rot: boolean, viewW: number, viewH: number): { position: "fixed"; left: number; top: number; width: number; height: number; transformOrigin?: string; transform?: string } {
  if (!rot) return { position: "fixed", left: 0, top: 0, width: viewW, height: viewH };
  return { position: "fixed", left: 0, top: 0, width: viewH, height: viewW, transformOrigin: "top left", transform: `translateX(${viewW}px) rotate(90deg)` };
}
