/** The colour theme a student picks: follow the device, or always light / dark. Kept in a cookie so the server can
 * put it on <html> before the first paint (no flash of the wrong theme). */
export type ThemeMode = "system" | "light" | "dark";

export const THEME_COOKIE = "hy-theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const ORDER: readonly ThemeMode[] = ["system", "light", "dark"];

export const THEME_LABELS: Record<ThemeMode, string> = {
  system: "기기 설정 따름",
  light: "라이트 모드",
  dark: "다크 모드",
};

/** Anything other than a known mode (missing, tampered) falls back to following the device. */
export function parseThemeMode(value: string | undefined | null): ThemeMode {
  return ORDER.find(mode => mode === value) ?? "system";
}

/** The toggle cycles system → light → dark → system. */
export function nextThemeMode(mode: ThemeMode): ThemeMode {
  return ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
}
