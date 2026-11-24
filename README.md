# HY-Easy

한양대학교 HY-WEP 현장실습 공고를 한곳에서 검색·비교하고, 지원 일정을 관리하는 학생용 웹 서비스입니다.

> 한양대학교 공식 서비스가 아닙니다. 지원은 반드시 HY-WEP 원문에서 합니다.

## 무엇을 하나요

- **공고 목록**: 직군·지역·기간·지원금으로 거르고, 최신순·마감순·지원금순으로 정렬합니다.
- **공고 상세**: 실습정보·자격사항·실습내용 원문과 함께 직군 분류 근거, 일정, HY-WEP 원문 링크를 보여 줍니다.
- **비교**: 공고를 최대 4개까지 나란히 봅니다.
- **지원 플래너**: 관심 공고와 지원 상태를 기록하고 다음 지원 가능 시점을 계산합니다. HY-WEP는 한 번에 한 기업만 지원할 수 있어서, 탈락 처리가 끝나야 다음 지원으로 넘어가도록 설계했습니다.
- **관리자 화면**: 수집 상태, 분류 검토·수정, 사용 현황을 봅니다.

`@hanyang.ac.kr` Google 계정으로만 로그인할 수 있습니다. 로그인 없이 구조를 보고 싶다면 가상 데이터로 된 `/demo`를 쓰세요.

## 구성

```
HY-WEP ──(수집기: Playwright)──▶ Supabase Postgres ◀── Next.js 웹 (Vercel)
                  │                     ▲
                  └──(직군 분류: Claude)─┘
```

| 영역      | 위치                            | 기술                                                                                                            |
| --------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 웹        | `src/`                          | Next.js 16 App Router, React 19, Astryx UI, Supabase Auth(Google)                                               |
| 수집기    | `worker/`                       | Playwright. Cloud Run Job으로 평일 09–18시에 10분마다 실행. 목록만 매번 읽고 새 공고·바뀐 공고의 상세만 엽니다. |
| 직군 분류 | `src/lib/classifier.ts`         | Claude Haiku(Vertex AI). 규칙 검사를 거친 결과만 공개하고, 애매한 건은 관리자 검토로 보냅니다.                  |
| DB        | `supabase/`                     | Postgres 마이그레이션, RLS 정책, 역할별 권한                                                                    |
| 인프라    | `infra/`                        | Terraform(GCP): Cloud Run Job, Cloud Scheduler, Secret Manager, 모니터링, GitHub OIDC 배포                      |
| 백업      | `backup/`                       | 하루 두 번 DB를 비공개 버킷(서울)에 백업. 복구 절차는 [docs/BACKUP.md](docs/BACKUP.md)                          |
| 평가      | `evals/`, `scripts/evaluate.ts` | 분류 정답표로 정확도를 채점합니다. 정답표는 로그인해야 볼 수 있는 공고 원문이라 저장소에 넣지 않습니다.         |

## 로컬에서 실행

Node.js 22가 필요합니다.

```bash
npm ci
cp .env.example .env.local   # Supabase URL·publishable key를 채웁니다
npm run dev                   # http://127.0.0.1:3000
```

Supabase 없이 화면만 보려면 `npm run dev` 후 `/demo`를 엽니다.

| 명령                | 내용                               |
| ------------------- | ---------------------------------- |
| `npm run check`     | lint, Prettier, 타입 검사, 테스트  |
| `npm run build`     | 프로덕션 빌드                      |
| `npm run collector` | 수집기 1회 실행 (HY-WEP 계정 필요) |
| `npm run evaluate`  | 로컬 정답표로 분류 채점            |

## 배포

`main`에 push하면 GitHub Actions가 검사 후 배포합니다.

- **웹**: 운영 DB에 마이그레이션과 RPC가 모두 반영됐는지 확인한 뒤 Vercel에 배포합니다.
- **수집기·백업**: 해당 코드가 바뀌었을 때만 Cloud Build로 이미지를 만들어 Cloud Run Job에 반영합니다.
- GCP 인증은 Workload Identity Federation을 씁니다. 이 저장소의 `main` 브랜치만 배포 권한을 받으며, 저장소에 키 파일은 없습니다.

## 문서

- [docs/HYWEP-STRUCTURE.md](docs/HYWEP-STRUCTURE.md): HY-WEP 화면 구조와 수집 필드
- [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md): 색·글꼴·간격 토큰
- [docs/BACKUP.md](docs/BACKUP.md): DB 백업과 복구

## 개인정보

수집·보관하는 정보와 보관 기간은 서비스의 [개인정보처리방침](src/app/privacy/page.tsx)에 적혀 있습니다.
