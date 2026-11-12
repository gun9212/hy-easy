# DB 백업과 복구

## 구성

- **언제**: 매일 03:00, 15:00 (KST). Cloud Scheduler `hy-easy-backup-night`, `hy-easy-backup-day`가 Cloud Run 작업 `hy-easy-backup`(서울, `asia-northeast3`)을 실행합니다.
- **어디에**: 비공개 버킷 `hy-easy-hy-easy-db-backup`(서울). 공개 접근 차단, 30일이 지나면 자동 삭제.
- **무엇을**: 실행마다 `YYYY-MM-DD_HHMM/` 폴더에 두 파일을 만듭니다.
  - `public.dump`: `public` 스키마 전체(구조 + 데이터). 공고, 분류, 관심 공고, 지원 기록, 관리자 등.
  - `auth.dump`: `auth.users`, `auth.identities` 데이터. 학생 기록이 가리키는 계정 ID, 이메일, 전공(`user_metadata.major`).
- **권한**: 백업 계정(`hy-easy-backup`)은 객체 생성만 할 수 있습니다. 읽기, 덮어쓰기, 삭제는 못 하므로 이 계정이 탈취돼도 기존 백업은 안전합니다. 읽기는 프로젝트 소유자·편집자·뷰어(현재 운영자 본인)만 할 수 있습니다.
- **접속 정보**: Secret Manager `hy-easy-db-url`(Supabase session pooler, 5432 포트). Supabase DB 비밀번호를 바꾸면 `scripts/push-secrets.sh hy-easy hy-easy-db-url`로 갱신합니다.
- **알림**: 백업이 실패하거나 14시간 넘게 성공이 없으면 운영자 메일로 알립니다(`infra/backup.tf`의 `HY-Easy DB 백업 실패`).
- **코드**: `backup/run.sh`(백업), `backup/restore-test.sh`(복구 연습), `infra/backup.tf`. 이미지는 `backup/`이 바뀌면 GitHub Actions가 빌드합니다.

## 복구

최대 12시간치 변경을 잃을 수 있습니다. 걸리는 시간은 30분 정도입니다.

1. **백업 내려받기**
   ```
   gcloud storage ls gs://hy-easy-hy-easy-db-backup/
   gcloud storage cp -r gs://hy-easy-hy-easy-db-backup/<YYYY-MM-DD_HHMM> ./restore
   ```
2. **복구할 Supabase 프로젝트 준비**: 새 프로젝트를 만들거나 기존 프로젝트를 씁니다. Supabase가 `auth` 스키마와 역할(`anon`, `authenticated`, `service_role`)을 만들어 둡니다. Google 로그인 설정과 Site URL은 새 프로젝트라면 다시 등록합니다.
3. **계정 먼저 넣기**: 학생 기록이 계정 ID를 참조하므로 순서가 중요합니다. 기존 프로젝트라면 남아 있는 계정과 겹치지 않는지 먼저 확인합니다.
   ```
   pg_restore --no-owner --data-only -d "$DB_URL" restore/auth.dump
   ```
4. **public 스키마 넣기**: 덤프가 스키마를 직접 만들므로 기존 `public`을 비운 뒤 넣습니다(기존 프로젝트라면 되돌릴 수 없으니 주의).
   ```
   psql "$DB_URL" -c 'drop schema public cascade'
   pg_restore --no-owner --no-privileges -d "$DB_URL" restore/public.dump
   ```
   `--no-privileges`로 넣었으므로 권한(grant)은 마이그레이션 파일의 grant 문을 다시 실행해 맞춥니다.
5. **확인**: 학생 계정으로 로그인해 관심 공고와 지원 기록이 보이는지 확인하고, 수집기를 한 번 실행합니다.

`pg_dump`·`pg_restore`는 17 이상이어야 합니다(Supabase가 Postgres 17). 로컬에 없으면 백업 이미지 안에서 실행합니다.

## 복구 연습

`backup/restore-test.sh`는 백업을 빈 Postgres 17에 넣고, 실제 DB와 행 수를 비교하고, 계정과 끊긴 학생 기록이 없는지 셉니다. 실제 DB는 읽기만 합니다.

```
docker build -t hy-easy-backup backup
docker run --rm --user postgres -e SUPABASE_DB_URL="$DB_URL" -e DUMP_DIR=/dump \
  -v "$PWD/restore:/dump:ro" -v "$PWD/backup/restore-test.sh:/restore-test.sh:ro" \
  --entrypoint sh hy-easy-backup /restore-test.sh
```

### 기록

| 날짜       | 백업                                          | 결과                                                                                                  |
| ---------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 2026-11-12 | 로컬에서 만든 덤프(public 약 780KB, auth 3KB) | 계정 1, 공고 296, 분류 296, 관리자 1, 관심 공고 0, 지원 기록 0으로 실제 DB와 일치. 계정 없는 기록 0건 |
