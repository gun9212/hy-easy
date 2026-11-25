import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classificationInput,
  combineDeadline,
  CONTACT_REDACTED,
  parseCount,
  stableHash,
  stripContactInfo,
  parseSelectionInfo,
  parseStipend,
  sourceHash,
  splitInstitution,
} from "../src/lib/normalize";
import { samplePostings } from "../src/lib/sample";

describe("HY-WEP 실측 형식", () => {
  it("목록 지원금 '월/1,620,000' (원 없음)", () => {
    assert.deepEqual(parseStipend("월/1,620,000"), { raw: "월/1,620,000", amount: 1_620_000, unit: "month" });
  });
  it("상세 지원금 '월 1,620,000 원'", () => assert.equal(parseStipend("월 1,620,000 원").amount, 1_620_000));
  it("숫자가 여러 개면 확정 금액으로 보지 않음", () => assert.equal(parseStipend("월 100만원, 식대 10").amount, null));
  it("0원은 확정 금액이 아님", () => assert.equal(parseStipend("월/0").amount, null));
  it("날짜·시간 컬럼 결합 '24시까지'", () => {
    const deadline = combineDeadline("2026-10-26", "24시까지");
    assert.equal(deadline.at, "2026-10-26T15:00:00.000Z");
    assert.equal(deadline.precision, "minute");
  });
  it("시간 컬럼이 비면 날짜 정밀도", () => assert.equal(combineDeadline("2026-10-26", "").precision, "date"));
  it("선발정보 문자열 분해", () => {
    const info = parseSelectionInfo("2 명 / 학년무관 / 접수마감 : 2026-10-26 / 시간 : 24시까지");
    assert.equal(info.headcount, 2);
    assert.equal(info.grade, "학년무관");
    assert.equal(info.deadline.at, "2026-10-26T15:00:00.000Z");
  });
  it("선발정보에 마감이 없으면 미확인", () =>
    assert.equal(parseSelectionInfo("2 명 / 학년무관").deadline.precision, "unknown"));
  it("인원 수", () => {
    assert.equal(parseCount("2"), 2);
    assert.equal(parseCount("12 명"), 12);
    assert.equal(parseCount("-"), null);
  });
  it("기관명 / 부서명 분리, 배지 제거, 띄어쓰기 없는 '/'는 기관명 일부", () => {
    assert.deepEqual(splitInstitution("가상테크(주) / 개발팀 신규모집"), {
      company: "가상테크(주)",
      department: "개발팀",
    });
    assert.deepEqual(splitInstitution("가상A/가상B센터 / 기획팀"), {
      company: "가상A/가상B센터",
      department: "기획팀",
    });
    assert.deepEqual(splitInstitution("가상테크(주)"), { company: "가상테크(주)", department: "" });
  });
  it("지원인원 변동은 변경 이력 해시에 영향 없음", () => {
    const p = samplePostings[0];
    assert.equal(sourceHash(p), sourceHash({ ...p, applicants: 99 }));
  });
});

describe("첨부 파일과 분류 입력", () => {
  const p = samplePostings[0];
  const attachment = {
    fileName: "a.pdf",
    fileHash: "h1",
    pages: 2,
    text: "첨부 본문",
    truncated: false,
    extractedAt: "2026-11-15T00:00:00Z",
  };
  it("첨부가 없는 공고는 세 필드 그대로라 분류 해시가 바뀌지 않음", () => {
    const input = classificationInput(p);
    assert.deepEqual(Object.keys(input), ["practiceInfo", "qualifications", "tasks"]);
    assert.equal(
      stableHash(input),
      stableHash({ practiceInfo: p.practiceInfo, qualifications: p.qualifications, tasks: p.tasks }),
    );
  });
  it("첨부가 있으면 첨부 글자와 부서명을 함께 넘김", () => {
    const input = classificationInput({ ...p, attachment });
    assert.equal(input.attachment, "첨부 본문");
    assert.equal(input.department, p.department);
  });
  it("추출 시각만 바뀐 첨부는 변경으로 치지 않고, 파일이 바뀌면 변경", () => {
    const base = sourceHash({ ...p, attachment });
    assert.equal(base, sourceHash({ ...p, attachment: { ...attachment, extractedAt: "2026-11-16T00:00:00Z" } }));
    assert.notEqual(base, sourceHash({ ...p, attachment: { ...attachment, fileHash: "h2" } }));
  });
  it("업무·자격·첨부 본문의 담당자 이메일·전화번호는 분류 입력에서 제외하고 날짜·지원금은 보존", () => {
    const withContacts = {
      ...p,
      tasks: "백엔드 API 개발 (문의: recruit.team@example.co.kr / 02-2220-1234, 2026-11-25 마감, 월 1,620,000원)",
      qualifications: "Python 가능자 · 담당자 010-9876-5432 또는 01012345678, 대표번호 1588-1234",
      attachment: {
        ...attachment,
        text: "부서 안내 +82-10-1111-2222 / (031) 777-8888 / hr@corp.kr · 근무시간 09:00 ~ 18:00",
      },
      department: "개발팀 (dev@corp.kr)",
    };
    const input = classificationInput(withContacts);
    const serialized = JSON.stringify(input);
    for (const secret of [
      "recruit.team@example.co.kr",
      "02-2220-1234",
      "010-9876-5432",
      "01012345678",
      "1588-1234",
      "+82-10-1111-2222",
      "777-8888",
      "hr@corp.kr",
      "dev@corp.kr",
    ]) {
      assert.equal(serialized.includes(secret), false, `expected ${secret} to be stripped`);
    }
    assert.match(input.tasks, /2026-11-25 마감/);
    assert.match(input.tasks, /월 1,620,000원/);
    assert.match(input.attachment!, /근무시간 09:00 ~ 18:00/);
    assert.ok(input.tasks.includes(CONTACT_REDACTED));
    // Display sourceHash still tracks raw source changes.
    assert.notEqual(
      sourceHash(withContacts),
      sourceHash({
        ...withContacts,
        qualifications: withContacts.qualifications.replace("010-9876-5432", "010-0000-0000"),
      }),
    );
    assert.equal(stripContactInfo("일반 업무 설명 2026.01.01 ~ 2026.02.28"), "일반 업무 설명 2026.01.01 ~ 2026.02.28");
  });
});
