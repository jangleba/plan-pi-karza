/**
 * Wspólna paleta pastelowa aplikacji (stonowana, do akcentów, nie do dużych powierzchni).
 * c – obrys, s – jasne tło, i – ciemny tekst na jasnym tle, solid – mocniejszy odcień do małych pełnych elementów.
 */
export interface Pastel { c: string; s: string; i: string; solid: string }
export const PASTEL = {
  blue: { c: "#9db9de", s: "#eff4fa", i: "#2f4d75", solid: "#6f93c6" },
  mint: { c: "#9fd2b7", s: "#edf7f1", i: "#2a5d43", solid: "#6fb592" },
  peach: { c: "#f0c29d", s: "#fdf3ea", i: "#8a5428", solid: "#e0a070" },
  lavender: { c: "#c3b0e4", s: "#f4effb", i: "#4e3a7a", solid: "#a28ad0" },
  aqua: { c: "#94d3da", s: "#ecf7f8", i: "#1f5f68", solid: "#6cb7c2" },
  rose: { c: "#eaadc7", s: "#fcf0f5", i: "#7d3a58", solid: "#d98ab0" },
} as const satisfies Record<string, Pastel>;
