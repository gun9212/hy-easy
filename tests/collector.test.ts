import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detailUrl, selectorsSchema, sourceUrl } from "../worker/adapter";
import {
  columnIndex, extractSourceId, listFields, listRowHash, normalizeDetail, recruitmentStatus, termName,
  type DetailFields, type ListRow,
} from "../worker/hywep-fields";

// Header texts as measured on the HY-WEP list page (fictional values below).
const HEADERS = [
  "번호", "실습기관분류", "실습기관명", "부서\n(상세모집정보)", "실습기관 진행상태", "신규모집", "홈페이지", "소재지",
  "모집마감일", "마감시간", "실습기간", "기관지원금", "유형", "모집전공", "모집인원", "지원인원", "실습신청",
];
const CELLS = [
  "1", "기업", "가상테크(주)", "개발팀", "접수중", "신규모집", "클릭", "서울 성동구",
  "2026-11-22", "24시까지", "2027-01-01~\n2027-02-28", "월/1,620,000", "직무체험형", "컴퓨터소프트웨어학부", "2", "7", "",
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
  it("onclick 인자에서 ID 추출", () => assert.equal(extractSourceId("fnView('12345');", "\\(\\s*'?([\\w.-]+)'?"), "12345"));
  it("ID가 없거나 형식이 이상하면 실패", () => {
    assert.throws(() => extractSourceId(null, "(\\d+)"), /SOURCE_ID_NOT_FOUND/);
    assert.throws(() => extractSourceId("fnView('a b<c')", "'([^']+)'"), /SOURCE_ID_INVALID/);
  });
  it("상세 URL은 HY-WEP HTTPS로 제한하고 ID를 인코딩", () => {
    assert.equal(detailUrl("https://hywep.hanyang.ac.kr/v.do?id={id}", "A-1"), "https://hywep.hanyang.ac.kr/v.do?id=A-1");
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
    assert.throws(() => normalizeDetail({ ...DETAIL, 실습내용: "", 자격사항: "" }, row()), /DETAIL_REQUIRED_FIELDS_MISSING/);
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
