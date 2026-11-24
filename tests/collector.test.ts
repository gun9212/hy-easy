import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  detailUrl,
  listUrl,
  parseScheduleOverride,
  redirectedAway,
  selectorsSchema,
  SessionExpired,
  sourceUrl,
} from "../worker/adapter";
import { safeCollectorErrorCode } from "../worker/error-codes";
import {
  credentialsFromEnv,
  ensureSession,
  isLoginBlocked,
  LoginBlocked,
  LoginFailed,
  loginWithPassword,
  parseLoginGuard,
  recordLoginFailure,
} from "../worker/portal-login";
import {
  columnIndex,
  extractSourceId,
  fillTemplate,
  hasNextPage,
  listFields,
  listRowHash,
  normalizeDetail,
  pageNumber,
  recruitmentStatus,
  termName,
  type DetailFields,
  type ListRow,
} from "../worker/hywep-fields";

// Header texts as measured on the HY-WEP list page (fictional values below).
const HEADERS = [
  "번호",
  "실습기관분류",
  "실습기관명",
  "부서\n(상세모집정보)",
  "실습기관 진행상태",
  "신규모집",
  "홈페이지",
  "소재지",
  "모집마감일",
  "마감시간",
  "실습기간",
  "기관지원금",
  "유형",
  "모집전공",
  "모집인원",
  "지원인원",
  "실습신청",
];
const CELLS = [
  "1",
  "기업",
  "가상테크(주)",
  "개발팀",
  "접수중",
  "신규모집",
  "클릭",
  "서울 성동구",
  "2026-11-22",
  "24시까지",
  "2027-01-01~\n2027-02-28",
  "월/1,620,000",
  "직무체험형",
  "컴퓨터소프트웨어학부",
  "2",
  "7",
  "",
];
const DETAIL: DetailFields = {
  현장실습명: "2026년도 겨울학기 단기 현장실습(,2027.01.01~2027.02.28)",
  실습기관명: "가상테크(주) / 개발팀 신규모집",
  소재지: "서울 성동구",
  실습기간: "2027-01-01 ~ 2027-02-28",
  선발대상: "컴퓨터소프트웨어학부",
  선발정보: "2 명 / 학년무관 / 접수마감 : 2026-11-22 / 시간 : 24시까지",
  유형: "직무체험형",
  자격사항: "Java와 SQL 기초",
  실습내용: "-직무명 : 백엔드 API 개발 -직무개요 : 서비스 API를 개발합니다.",
  면접정보: "면접유형 : 서류전형+면접전형",
  근무시간: "09시 00분 ~ 18시 00분",
  기관지원금: "월 1,620,000 원",
  기관지원금지급일: "익월 10일",
};

function row(overrides: Partial<ListRow["fields"]> = {}): ListRow {
  const fields = { ...listFields(CELLS, columnIndex(HEADERS)), ...overrides };
  return { id: "P001", url: "https://hywep.hanyang.ac.kr/compjoinmanage/view_stu.do?id=P001", fields };
}

describe("HY-WEP 목록 파싱", () => {
  it("헤더 이름으로 컬럼을 찾음 (순서·공백·줄바꿈 무관)", () => {
    const fields = row().fields;
    assert.equal(fields.department, "개발팀");
    assert.equal(fields.status, "접수중");
    assert.equal(fields.stipend, "월/1,620,000");
    assert.equal(fields.period, "2027-01-01~ 2027-02-28");
    assert.equal(fields.applicants, "7");
  });
  it("필수 컬럼이 없으면 구조 변경으로 실패", () => {
    assert.throws(() => columnIndex(["번호", "실습기관명"]), /LIST_STRUCTURE_CHANGED/);
  });
  it("지원인원 변동은 목록 해시를 바꾸지 않음", () => {
    assert.equal(listRowHash(row().fields), listRowHash(row({ applicants: "30" }).fields));
  });
  it("마감일 변경은 목록 해시를 바꿈", () => {
    assert.notEqual(listRowHash(row().fields), listRowHash(row({ deadlineDate: "2026-11-29" }).fields));
  });
  it("진행상태 매핑", () => {
    assert.equal(recruitmentStatus("접수중"), "open");
    assert.equal(recruitmentStatus("접수마감"), "closed");
    assert.equal(recruitmentStatus(""), "unknown");
    assert.equal(recruitmentStatus("일시중지"), "unknown");
  });
});

describe("원문 ID 추출", () => {
  it("onclick 인자에서 ID 추출", () =>
    assert.equal(extractSourceId("fnView('12345');", "\\(\\s*'?([\\w.-]+)'?"), "12345"));
  it("ID가 없거나 형식이 이상하면 실패", () => {
    assert.throws(() => extractSourceId(null, "(\\d+)"), /SOURCE_ID_NOT_FOUND/);
    assert.throws(() => extractSourceId("fnView('a b<c')", "'([^']+)'"), /SOURCE_ID_INVALID/);
  });
  it("상세 URL은 HY-WEP HTTPS로 제한하고 ID를 인코딩", () => {
    assert.equal(
      detailUrl("https://hywep.hanyang.ac.kr/v.do?id={id}", "A-1"),
      "https://hywep.hanyang.ac.kr/v.do?id=A-1",
    );
    assert.throws(() => detailUrl("https://attacker.invalid/?id={id}", "1"), /UNTRUSTED_SOURCE_URL/);
  });
});

describe("HY-WEP 상세 정규화", () => {
  const posting = normalizeDetail(DETAIL, row(), "2026-11-10T00:00:00.000Z");
  it("목록 값(상태·마감·인원)과 상세 텍스트를 병합", () => {
    assert.equal(posting.company, "가상테크(주)");
    assert.equal(posting.department, "개발팀");
    assert.equal(posting.recruitment, "open");
    assert.equal(posting.deadline.at, "2026-11-22T15:00:00.000Z");
    assert.equal(posting.headcount, 2);
    assert.equal(posting.applicants, 7);
    assert.equal(posting.stipend.amount, 1_620_000);
    assert.equal(posting.stipend.unit, "month");
  });
  it("직무명을 제목으로, 학기명은 괄호 제거", () => {
    assert.equal(posting.title, "백엔드 API 개발");
    assert.equal(posting.term, "2026년도 겨울학기 단기 현장실습");
    assert.equal(termName("A 현장실습"), "A 현장실습");
  });
  it("분류 입력: 실습내용·자격사항 원문 보존, 실습정보는 유형·선발대상 요약", () => {
    assert.equal(posting.tasks, DETAIL.실습내용);
    assert.equal(posting.qualifications, DETAIL.자격사항);
    assert.match(posting.practiceInfo, /유형: 직무체험형/);
    assert.match(posting.practiceInfo, /선발대상: 컴퓨터소프트웨어학부/);
    assert.equal(posting.classification, null);
  });
  it("목록 값이 없으면 상세의 기관명·선발정보로 대체", () => {
    const fallback = normalizeDetail(DETAIL, { ...row(), fields: {} });
    assert.equal(fallback.company, "가상테크(주)");
    assert.equal(fallback.department, "개발팀");
    assert.equal(fallback.deadline.at, "2026-11-22T15:00:00.000Z");
    assert.equal(fallback.headcount, 2);
    assert.equal(fallback.recruitment, "unknown");
  });
  it("업무·자격이 모두 비면 수집 실패", () => {
    assert.throws(
      () => normalizeDetail({ ...DETAIL, 실습내용: "", 자격사항: "" }, row()),
      /DETAIL_REQUIRED_FIELDS_MISSING/,
    );
  });
});

describe("목록 페이지 이동 (실측: GET list.do?schedule=&pg=, 0부터 시작)", () => {
  const template = "https://hywep.hanyang.ac.kr/compjoinsearch/list.do?schedule={schedule}&status=1137&pg={page}";
  it("회차·페이지로 목록 URL 생성", () => {
    assert.equal(
      listUrl(template, "119", 0),
      "https://hywep.hanyang.ac.kr/compjoinsearch/list.do?schedule=119&status=1137&pg=0",
    );
  });
  it("pg 없으면 첫 페이지(0)", () => {
    assert.equal(pageNumber("https://hywep.hanyang.ac.kr/compjoinsearch/list.do"), 0);
    assert.equal(pageNumber("https://hywep.hanyang.ac.kr/compjoinsearch/list.do?pg=3"), 3);
  });
  it("Paging(n) 링크로 다음 페이지 존재 판단", () => {
    const links = ["javascript:;", "javaScript:Paging(1)", "javaScript:Paging(2)", null];
    assert.equal(hasNextPage(links, 0, "Paging\\((\\d+)\\)"), true);
    assert.equal(hasNextPage(links, 2, "Paging\\((\\d+)\\)"), false);
  });
  it("템플릿 값이 빠지면 실패", () =>
    assert.throws(() => fillTemplate("a?{schedule}&{page}", { schedule: 1 }), /TEMPLATE_VALUE_MISSING/));
});

describe("실측 선택자 파일", () => {
  const selectors = selectorsSchema.parse(JSON.parse(readFileSync("worker/selectors.example.json", "utf8")));
  it("실제 속성 형식에서 공고 ID를 추출", () => {
    assert.equal(extractSourceId("javascript:goView('22253');", selectors.sourceIdPattern), "22253");
  });
  it("회차 지정(HYWEP_SCHEDULES): 없으면 현재 회차만, 숫자 목록만 허용", () => {
    assert.equal(parseScheduleOverride(undefined), null);
    assert.equal(parseScheduleOverride(" "), null);
    assert.deepEqual(parseScheduleOverride("119, 120,119"), ["119", "120"]);
    assert.throws(() => parseScheduleOverride("119;drop"), /HYWEP_SCHEDULES_INVALID/);
  });
  it("상세 URL은 jid_seq GET", () => {
    assert.equal(
      detailUrl(selectors.detailUrlTemplate, "22253"),
      "https://hywep.hanyang.ac.kr/compjoinmanage/view_stu.do?jid_seq=22253",
    );
  });
  it("검증 플래그는 실제 실행 확인 전까지 false", () => assert.equal(selectors.verified, false));
  it("상세 페이지에서 다른 경로로 이동하면 세션 만료로 판단", () => {
    const detail = "https://hywep.hanyang.ac.kr/compjoinmanage/view_stu.do?jid_seq=1";
    assert.equal(redirectedAway(detail, detail), false);
    assert.equal(redirectedAway(detail, "https://hywep.hanyang.ac.kr/index.do"), true);
    assert.equal(redirectedAway(detail, "https://api.hanyang.ac.kr/oauth/login"), true);
  });
});

describe("운영자 자동 로그인 자격 증명", () => {
  it("HYWEP_ID·HYWEP_PW가 모두 있어야 사용", () => {
    assert.deepEqual(credentialsFromEnv({ HYWEP_ID: " op ", HYWEP_PW: "pw" }), { id: "op", password: "pw" });
    assert.equal(credentialsFromEnv({ HYWEP_ID: "op" }), null);
    assert.equal(credentialsFromEnv({}), null);
  });
  it("실패 메시지에 입력값이 들어가지 않음", () => {
    assert.equal(new LoginFailed("PORTAL_REJECTED_OR_TIMEOUT").message, "LOGIN_FAILED: PORTAL_REJECTED_OR_TIMEOUT");
    assert.equal(new LoginBlocked().message, "LOGIN_BLOCKED");
  });
  it("포털에 닿지 못한 실패는 비밀번호 제출 전이라 차단 횟수에 세지 않음", () => {
    assert.equal(new LoginFailed("PORTAL_NOT_REACHED", false).credentialsSubmitted, false);
    assert.equal(new LoginFailed("PORTAL_REJECTED_OR_TIMEOUT").credentialsSubmitted, true);
    assert.equal(new LoginFailed("NOT_AUTHENTICATED_AFTER_LOGIN").credentialsSubmitted, true);
  });
  it("같은 자격 증명이 3회 연속 실패하면 계속 차단하고, 비밀번호가 바뀌면 자동으로 해제", () => {
    const oldCreds = { id: "student", password: "old-password" };
    const newCreds = { id: "student", password: "new-password" };
    const g1 = recordLoginFailure(null, oldCreds);
    assert.equal(g1.failures, 1);
    assert.equal(isLoginBlocked(g1, oldCreds), false);
    assert.equal(JSON.stringify(g1).includes("old-password"), false);
    assert.equal(JSON.stringify(g1).includes("student"), false);

    const g2 = recordLoginFailure(g1, oldCreds);
    assert.equal(g2.failures, 2);
    assert.equal(isLoginBlocked(g2, oldCreds), false);

    const g3 = recordLoginFailure(g2, oldCreds);
    assert.equal(g3.failures, 3);
    // Stays blocked on 4th, 5th, ... runs without resetting.
    assert.equal(isLoginBlocked(g3, oldCreds), true);
    assert.equal(isLoginBlocked(parseLoginGuard(g3), oldCreds), true);
    assert.equal(isLoginBlocked(g3, null), false);

    // Updating the password in Secret Manager unblocks automatically; if the new password fails, count restarts at 1.
    assert.equal(isLoginBlocked(g3, newCreds), false);
    const fresh = recordLoginFailure(g3, newCreds);
    assert.equal(fresh.failures, 1);
    assert.notEqual(fresh.salt, g3.salt);
    assert.equal(isLoginBlocked(fresh, newCreds), false);
  });
  it("손상되거나 빈 로그인 차단 상태는 안전하게 초기화", () => {
    assert.equal(parseLoginGuard({}), null);
    assert.equal(parseLoginGuard(null), null);
    assert.equal(parseLoginGuard({ salt: "bad", credentialHash: "bad", failures: 3 }), null);
  });
  it("포털 폼 입력 실패는 고정 코드(PORTAL_FORM_FILL_FAILED)로 바꾸고 자격 증명을 숨김", async () => {
    const secret = { id: "2026000001", password: "SuperSecretPortalPassword!99" };
    for (const failSelector of ["#uid", "#upw"] as const) {
      const fakePage = {
        goto: async () => null,
        waitForURL: async () => undefined,
        evaluate: async () => undefined,
        locator: (selector: string) => ({
          fill: async (value: string) => {
            if (selector === failSelector) {
              throw new Error(`locator.fill(${JSON.stringify(value)}): Timeout 15000ms exceeded on ${selector}`);
            }
          },
          click: async () => undefined,
        }),
      } as unknown as Parameters<typeof loginWithPassword>[0];

      await assert.rejects(
        () => loginWithPassword(fakePage, secret),
        (err: unknown) => {
          assert.ok(err instanceof LoginFailed);
          assert.equal(err.reason, "PORTAL_FORM_FILL_FAILED");
          assert.equal(err.credentialsSubmitted, false);
          assert.equal(err.message, "LOGIN_FAILED: PORTAL_FORM_FILL_FAILED");
          assert.equal(err.message.includes(secret.id), false);
          assert.equal(err.message.includes(secret.password), false);
          assert.equal(safeCollectorErrorCode(err), "LOGIN_FAILED:PORTAL_FORM_FILL_FAILED");
          return true;
        },
      );
    }
  });
  it("포털 초기 이동 또는 로그인 후 복귀 실패도 고정 코드로 처리", async () => {
    const secret = { id: "student", password: "pw" };
    const unreachablePage = {
      goto: async () => {
        throw new Error("net::ERR_CONNECTION_REFUSED");
      },
    } as unknown as Parameters<typeof loginWithPassword>[0];
    await assert.rejects(
      () => loginWithPassword(unreachablePage, secret),
      (err: unknown) =>
        err instanceof LoginFailed && err.reason === "PORTAL_NOT_REACHED" && err.credentialsSubmitted === false,
    );

    const selectors = selectorsSchema.parse(JSON.parse(readFileSync("worker/selectors.example.json", "utf8")));
    let gotoCount = 0;
    const postNavFailPage = {
      goto: async () => {
        gotoCount += 1;
        if (gotoCount === 3) throw new Error("page.goto: Timeout 30000ms exceeded");
        return null;
      },
      waitForURL: async () => undefined,
      evaluate: async () => undefined,
      locator: () => ({
        count: async () => 0,
        fill: async () => undefined,
        click: async () => undefined,
      }),
    } as unknown as Parameters<typeof ensureSession>[0];
    await assert.rejects(
      () => ensureSession(postNavFailPage, selectors, "https://hywep.hanyang.ac.kr/compjoinsearch/list.do", secret),
      (err: unknown) =>
        err instanceof LoginFailed &&
        err.reason === "POST_LOGIN_NAVIGATION_FAILED" &&
        err.credentialsSubmitted === false,
    );
  });
  it("오류 코드 변환기는 알려진 코드만 반환하고 원문 예외는 숨김", () => {
    assert.equal(safeCollectorErrorCode(new LoginBlocked()), "LOGIN_BLOCKED");
    assert.equal(
      safeCollectorErrorCode(new LoginFailed("PORTAL_FORM_FILL_FAILED", false)),
      "LOGIN_FAILED:PORTAL_FORM_FILL_FAILED",
    );
    assert.equal(safeCollectorErrorCode(new SessionExpired()), "SESSION_EXPIRED");
    assert.equal(safeCollectorErrorCode(new Error("LIST_STRUCTURE_CHANGED")), "LIST_STRUCTURE_CHANGED");
    assert.equal(safeCollectorErrorCode(new Error("ATTACHMENT_HTTP_503")), "ATTACHMENT_HTTP_503");
    assert.equal(safeCollectorErrorCode(new Error("ATTACHMENT_NOT_PDF:docx")), "ATTACHMENT_NOT_PDF");
    assert.equal(
      safeCollectorErrorCode(new Error('locator.fill("SuperSecretPw!"): Timeout'), "PROBE_FAILED"),
      "PROBE_FAILED",
    );
  });
});

describe("수집기 설정", () => {
  it("수집 링크를 HY-WEP HTTPS로 제한", () => {
    assert.throws(() => sourceUrl("https://attacker.invalid/"));
    assert.throws(() => sourceUrl("javascript:alert(1)"));
    assert.equal(sourceUrl("/detail?id=1"), "https://hywep.hanyang.ac.kr/detail?id=1");
  });
  it("선택자 파일은 모든 키와 {id} 템플릿이 필요", () => {
    assert.throws(() => selectorsSchema.parse({ verified: true }));
  });
});
