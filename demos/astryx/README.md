# HY-Easy × Astryx 데모

메인 앱의 공고 목록 화면을 [Astryx](https://github.com/meta/astryx) 디자인 시스템(`@astryxdesign/core` 0.7.15, 베타)으로 다시 만든 독립 Next.js 앱입니다. 로컬 전용이며 배포하지 않습니다. 메인 앱의 의존성과 배포에는 영향이 없습니다.

## 실행

```bash
npm ci                  # 저장소 루트: 공유하는 src/lib가 쓰는 zod 등
cd demos/astryx
npm ci
ln -s ../../.env.local .env.local   # 처음 한 번, 메인 앱의 Supabase 설정을 함께 씀 (gitignore됨)
npm run dev             # http://127.0.0.1:3100
```

## 데이터

- **실제 공고**: 메인 앱(포트 3000)에 한양대 Google 계정으로 로그인하면 실제 공고가 나옵니다. 쿠키는 포트와 무관하게 호스트 단위로 공유되므로, 메인 앱과 데모를 **같은 호스트**(`localhost` 또는 `127.0.0.1`)로 열어야 합니다.
  - 데모는 그 세션 쿠키를 읽기만 합니다. 서비스 키를 쓰지 않으므로 RLS가 메인 앱과 똑같이 적용됩니다.
  - 데모는 세션을 갱신하지 못합니다. 메인 앱을 한동안 열지 않아 만료되면 배너가 "만료"라고 알리고, 메인 앱을 한 번 열면 갱신됩니다.
- **가상 데이터**: 로그인 전, 학교 계정이 아님, 만료, 공고 없음, 오류일 때는 메인 앱의 `src/lib/sample.ts`를 보여주고 배너로 이유를 알립니다.
- **목록과 상세**: 첫 페이지에는 목록에 필요한 필드와 AI 요약만 보냅니다. 실습 내용·업무·자격·혜택·전형 일정·분류 근거는 드로어를 열 때 `/api/postings/[id]`로 가져옵니다(같은 세션·RLS).

## 구조

| 경로 | 역할 |
| --- | --- |
| `src/lib/postings-source.ts` | 세션 확인, 공고 목록·상세 읽기 (server-only) |
| `src/lib/list-posting.ts` | 목록용 요약 타입과 상세 타입 |
| `src/lib/posting-text.ts` | HY-WEP 원문 양식을 항목·목록·주차 일정으로 나누는 파서 |
| `src/lib/main-app.ts` | 메인 앱 링크(루프백 호스트만 허용), 세션 상태 판별 |
| `src/components/*` | 화면 (AppShell, Table/카드 목록, Drawer 등) |
| `src/app/globals.css` | neutral 테마 위에 한양 블루·Pretendard·한양 오렌지 경고색 토큰을 덮어씀 |

- 메인 앱 코드는 `@lib/*` 경로(`../../src/lib`)로 가져옵니다. Turbopack은 루트 밖 파일을 읽지 못하고, 루트를 넓히면 메인 앱의 `src/proxy.ts`까지 잡히므로 webpack으로 실행합니다.
- 컴포넌트 문서: `npm run astryx -- component <Name>`

## 검사

```bash
npm run typecheck
npm test                # tests/*.test.ts (원문 파서, 메인 앱 링크·세션 상태)
npm run build
```

CI(`.github/workflows/ci.yml`의 `demo` 작업)가 같은 검사와 Prettier 확인을 돌립니다. 이 작업이 실패해도 운영 배포는 막지 않습니다.
