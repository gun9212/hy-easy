# DB 백업과 복구

## 구성

- **언제**: 매일 03:00, 15:00 (KST). Cloud Scheduler `hy-easy-backup-night`, `hy-easy-backup-day`가 Cloud Run 작업 `hy-easy-backup`(서울, `asia-northeast3`)을 실행합니다.
- **어디에**: 비공개 버킷 `hy-easy-hy-easy-db-backup`(서울). 공개 접근 차단, 생성 후 23일이 지나면 자동 삭제되며 Cloud Storage 소프트 삭제로 7일간 추가 복구할 수 있습니다(총 30일 후 영구 삭제).
- **무엇을**: 실행마다 먼저 `public.purge_expired_activity_days(180)`로 180일이 지난 접속 기록을 정리한 뒤(새 방문이 없는 기간에도 만료 보장), 하나의 `REPEATABLE READ` 스냅샷(`pg_export_snapshot()`)에서 `YYYY-MM-DD_HHMM/` 폴더에 세 파일을 만듭니다.
  - `public.dump`: `public` 스키마 전체(구조 + 데이터). 공고, 분류, 관심 공고, 지원 기록, 관리자 등.
  - `auth.dump`: `auth.users`, `auth.identities` 데이터. 학생 기록이 가리키는 계정 ID, 이메일, 전공(`user_metadata.major`).
  - `manifest.json`: 같은 스냅샷 시점의 테이블별 행 수 기준표. 복구 연습 검증의 기준값으로 씁니다.
- **권한**: 백업 계정(`hy-easy-backup`)은 객체 생성만 할 수 있습니다. 읽기, 덮어쓰기, 삭제는 못 하므로 이 계정이 탈취돼도 기존 백업은 안전합니다. 읽기는 프로젝트 소유자·편집자·뷰어(현재 운영자 본인)만 할 수 있습니다.
- **접속 정보**: Secret Manager `hy-easy-db-url`(Supabase session pooler, 5432 포트). Supabase DB 비밀번호를 바꾸면 `scripts/push-secrets.sh hy-easy hy-easy-db-url`로 갱신합니다.
- **알림**: 백업이 실패하거나 14시간 넘게 성공이 없으면 운영자 메일로 알립니다(`infra/backup.tf`의 `HY-Easy DB 백업 실패`).
- **코드**: `backup/run.sh`(백업), `backup/restore-test.sh`(복구 연습), `infra/backup.tf`. 이미지는 `backup/`이 바뀌면 GitHub Actions가 빌드합니다.

## 복구

최대 12시간치 변경을 잃을 수 있습니다. 걸리는 시간은 30분 정도입니다.

1. **외부 접근 격리 및 수집기 중지**: 복구 도중 외부 API 요청이나 수집기 실행이 반쯤 복구된 DB에 닿지 않도록 먼저 차단합니다.
   ```
   scripts/deploy-collector.sh schedule-off
   gcloud run jobs executions list --job hy-easy-collector --project hy-easy --region asia-northeast1 --limit 3
   gcloud run jobs executions list --job hy-easy-backup --project hy-easy --region asia-northeast3 --limit 3
   ```
   실행 중인 작업이 없는지 확인합니다. 복구는 **새로 만든 격리 Supabase 프로젝트**에 진행해 검증과 변경 이력 재반영이 끝날 때까지 외부 트래픽과 완전히 분리하는 것을 원칙으로 합니다. 불가피하게 기존 프로젝트에 덮어쓰는 경우 Vercel 트래픽을 유지보수 상태로 차단하고 Supabase API 외부 접근을 막은 뒤 진행합니다.
2. **백업 내려받기**
   ```
   gcloud storage ls gs://hy-easy-hy-easy-db-backup/
   gcloud storage cp -r gs://hy-easy-hy-easy-db-backup/<YYYY-MM-DD_HHMM> ./restore
   ```
3. **복구할 Supabase 프로젝트 준비**: 새 격리 프로젝트를 준비합니다(Supabase가 `auth` 스키마와 역할 `anon`, `authenticated`, `service_role`을 미리 만들어 둡니다). Google 로그인 설정과 Site URL은 전환 전에 등록하되, 검증이 끝날 때까지 Vercel 환경 변수와 Secret Manager `hy-easy-db-url`은 아직 바꾸지 않습니다.
4. **계정 먼저 넣기**: 학생 기록이 계정 ID를 참조하므로 순서가 중요합니다. 기존 프로젝트라면 남아 있는 계정과 겹치지 않는지 먼저 확인합니다.
   ```
   pg_restore --no-owner --data-only -d "$DB_URL" restore/auth.dump
   ```
5. **`public` 스키마와 권한을 단일 트랜잭션으로 원자적 복구 및 유효 권한 검증**:
   ```
   DB_URL="$DB_URL" PUBLIC_DUMP=restore/public.dump sh backup/restore-public.sh
   ```
   `--no-privileges`로 복구한 직후와 `supabase/privileges.sql` 적용 사이에는 PostgreSQL 기본 권한 때문에 수집기 전용 함수가 `PUBLIC`에 열릴 수 있습니다. `backup/restore-public.sh`는 `DROP SCHEMA public CASCADE`, `pg_restore --no-owner --no-privileges`, `supabase/privileges.sql`을 하나의 트랜잭션(`--single-transaction`)으로 묶어 노출 구간을 없애고, 이어서 `tests/database-privileges.sql`로 스키마 권한(`CREATE`/`USAGE`), 전 테이블 RLS 활성화, `posting_view`의 `security_invoker=true`, 익명·학생·관리자·수집기 함수의 유효 권한을 검증합니다.
6. **백업 이후 삭제·관리자 해제 재반영**: 백업 시점(`restore/manifest.json`의 `createdAt`) 이후 처리한 계정 삭제와 관리자 권한 해제는 복구된 덤프에 되살아나 있으므로, 서비스 재개 전에 DB 외부에 별도 보관한 운영 변경 이력(`post-backup-changes.json`, UUID와 UTC 시각만 기록)과 대조해 다시 적용합니다.
   ```
   MANIFEST=restore/manifest.json LEDGER=./post-backup-changes.json \
     sh backup/reconcile-restore.sh --dry-run
   DB_URL="$DB_URL" MANIFEST=restore/manifest.json LEDGER=./post-backup-changes.json \
     sh backup/reconcile-restore.sh
   ```
   분류 편집 이력이 있던 계정을 삭제해도 `classification_overrides`와 `classification_audit`의 `editor_id`만 `NULL`로 바뀌고 보정 결과와 감사 이력은 유지됩니다. 평상시 계정 삭제나 관리자 권한 해제를 처리할 때마다 DB 외부의 비공개 저장소(예: 별도 운영 버킷 또는 로컬 암호화 보관소)에 `{ "at": "<UTC ISO-8601>", "action": "delete_user" | "revoke_admin", "userId": "<UUID>" }` 항목을 추가해 둡니다.
7. **서비스 재개 및 확인**: 5번 유효 권한 검증과 6번 변경 이력 재반영이 모두 통과한 뒤에만 Vercel 환경 변수·Secret Manager `hy-easy-db-url`을 전환하거나 외부 트래픽을 엽니다. 학생 계정으로 로그인해 관심 공고와 지원 기록이 보이는지 확인하고, 수집기를 1회 수동 실행(`scripts/deploy-collector.sh run`)한 뒤 스케줄(`scripts/deploy-collector.sh schedule`)을 다시 켭니다.

`pg_dump`·`pg_restore`는 17 이상이어야 합니다(Supabase가 Postgres 17). 로컬에 없으면 백업 이미지 안에서 실행합니다.

## 복구 연습

`backup/restore-test.sh`는 백업을 빈 Postgres 17에 넣고, `supabase/privileges.sql` 적용과 `tests/database-privileges.sql` 권한 검증, 같은 스냅샷에서 기록한 `manifest.json` 행 수 대조, 주요 외래키·계정 참조 무결성(고아 행 0건)을 검사합니다. 어느 하나라도 기준을 벗어나면 0이 아닌 종료 코드로 실패합니다. 실제 DB는 `auth` 테이블 구조 조회에만 읽기 전용으로 씁니다.

```
docker build -t hy-easy-backup backup
docker run --rm --user postgres -e SUPABASE_DB_URL="$DB_URL" -e DUMP_DIR=/dump \
  -e PRIVILEGES_SQL=/privileges.sql -e PRIVILEGES_TEST_SQL=/database-privileges.sql \
  -v "$PWD/restore:/dump:ro" \
  -v "$PWD/backup/restore-test.sh:/restore-test.sh:ro" \
  -v "$PWD/supabase/privileges.sql:/privileges.sql:ro" \
  -v "$PWD/tests/database-privileges.sql:/database-privileges.sql:ro" \
  --entrypoint sh hy-easy-backup /restore-test.sh
```

### 기록

| 날짜       | 백업                                          | 결과                                                                                                  |
| ---------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 2026-11-12 | 로컬에서 만든 덤프(public 약 780KB, auth 3KB) | 계정 1, 공고 296, 분류 296, 관리자 1, 관심 공고 0, 지원 기록 0으로 실제 DB와 일치. 계정 없는 기록 0건 |
