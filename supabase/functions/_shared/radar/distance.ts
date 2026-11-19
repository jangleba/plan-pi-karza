const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

/** Odległość po kuli ziemskiej (km), z środka miejscowości do środka miejscowości – zawsze PRZYBLIŻONA. */
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
