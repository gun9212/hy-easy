# HY-Easy × Astryx 데모

메인 앱의 공고 목록 화면을 [Astryx](https://github.com/meta/astryx) 디자인 시스템(`@astryxdesign/core` 0.7.15)으로 다시 만든 독립 Next.js 앱입니다. 메인 앱 코드와 의존성은 건드리지 않습니다.

```bash
cd demos/astryx
npm install
npm run dev   # http://127.0.0.1:3100
```

- 데이터: 메인 앱의 가상 공고 `src/lib/sample.ts`를 `@lib/*` 경로로 그대로 가져옵니다.
- 테마: `theme-neutral` 위에 `src/app/globals.css`에서 한양 블루, Pretendard, 반경 토큰을 덮어씁니다(라이트/다크 모두).
- 사용 컴포넌트: AppShell, TopNav, SideNav, TextInput, Selector, SegmentedControl, Table, Badge, Drawer, MetadataList, Banner, EmptyState.
- 메인 앱의 `src/proxy.ts`를 집어오지 않도록 Turbopack 대신 webpack으로 실행합니다.
- 컴포넌트 문서: `npm run astryx -- component <Name>`
