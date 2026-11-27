"use client";

import type { ReactNode } from "react";
import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import koKR from "@astryxdesign/core/locales/ko-KR.generated.js";

/**
 * Astryx's own labels (skip link, menu buttons, dialog close) in Korean. The shipped catalog says "탐색" for
 * navigation; this app calls it a menu.
 */
const OVERRIDES = {
  "ko-KR": {
    "@astryx.appShell.mobileNavigation": "모바일 메뉴",
    "@astryx.mobileNav.navigation": "메뉴",
    "@astryx.mobileNav.toggle.open": "메뉴 열기",
    "@astryx.mobileNav.closeNavigation": "메뉴 닫기",
    "@astryx.sideNav.label": "사이드 메뉴",
    // Missing from the shipped ko-KR catalog, so these fell back to English.
    "@astryx.kbd.key.left": "왼쪽 화살표",
    "@astryx.kbd.key.right": "오른쪽 화살표",
    "@astryx.scrollRegion.label": "스크롤 영역",
  },
};

export function AstryxLocale({ children }: { children: ReactNode }) {
  return (
    <InternationalizationProvider locale="ko-KR" messages={{ "ko-KR": koKR }} overrides={OVERRIDES}>
      {children}
    </InternationalizationProvider>
  );
}
