"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { IconButton } from "@astryxdesign/core/IconButton";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE, THEME_LABELS, nextThemeMode, type ThemeMode } from "@/lib/theme-mode";

const ICONS: Record<ThemeMode, React.ReactElement> = {
  system: <Monitor size={16} />,
  light: <Sun size={16} />,
  dark: <Moon size={16} />,
};

/** Remembers the choice for the server, which puts it on <html> on the next page load (no flash). */
export function saveThemeMode(mode: ThemeMode): void {
  document.cookie = `${THEME_COOKIE}=${mode}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
}

type Props = { mode: ThemeMode; onChange: (mode: ThemeMode) => void };

/** One button that cycles 기기 설정 → 라이트 → 다크; the icon shows the current choice. */
export function ThemeToggle({ mode, onChange }: Props): React.ReactElement {
  const next = nextThemeMode(mode);
  return (
    <IconButton
      variant="ghost"
      size="sm"
      label={`화면 테마: ${THEME_LABELS[mode]} (눌러서 ${THEME_LABELS[next]})`}
      icon={ICONS[mode]}
      onClick={() => {
        saveThemeMode(next);
        onChange(next);
      }}
    />
  );
}
