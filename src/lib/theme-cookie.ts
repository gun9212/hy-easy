import { cookies } from "next/headers";
import { THEME_COOKIE, parseThemeMode, type ThemeMode } from "./theme-mode";

/** The student's theme choice for this request; "system" when none was made. */
export async function readThemeMode(): Promise<ThemeMode> {
  const store = await cookies();
  return parseThemeMode(store.get(THEME_COOKIE)?.value);
}
