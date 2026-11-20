import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  eligibility,
  simulate,
  filterPostings,
  assertEvidence,
  majorFit,
  verifySecondaryRoles,
  type Application,
  type ClassificationOutput,
} from "../src/lib/domain";
import { samplePostings, DEMO_NOW } from "../src/lib/sample";
import { parseDeadline, parseStipend, sourceHash, stableHash, classificationInput } from "../src/lib/normalize";
import { isSchoolClaims, isSchoolUser } from "../src/lib/auth-policy";
const p = samplePostings[0],
  ci = classificationInput(p),
  now = new Date(DEMO_NOW);
const application = (status: Application["status"]): Application => ({
  id: "a",
  postingId: p.id,
  status,
  updatedAt: DEMO_NOW,
});
describe("단일 지원과 마감 판단", () => {
  it("진행 중인 지원이 없고 정확한 마감 전일 때 일정상 가능", () =>
    assert.equal(eligibility(p, [], now).status, "available"));
  it("탈락 통보만으로 다음 지원을 허용하지 않음", () =>
    assert.equal(eligibility(p, [application("rejection_pending")], now).status, "blocked"));
  it("HY-WEP 탈락 처리 완료 기록 후 제한 해제", () =>
    assert.equal(eligibility(p, [application("rejected")], now).status, "available"));
  it("발표 예정일 경과를 지원 상태 변경으로 사용하지 않음", () =>
    assert.equal(
      eligibility({ ...p, events: [{ label: "서류발표", raw: "2020-01-01" }] }, [application("in_progress")], now)
        .status,
      "blocked",
    ));
  it("합격은 새 지원을 막고 확인 안내", () =>
    assert.equal(eligibility(p, [application("accepted")], now).status, "blocked"));
  it("상태 미확인은 가능으로 판단하지 않음", () =>
    assert.equal(eligibility(p, [application("unknown")], now).status, "unknown"));
  it("정확한 마감 시각부터 마감", () => assert.equal(eligibility(p, [], new Date(p.deadline.at!)).status, "closed"));
  it("마감 연장을 반영", () => {
    const later = new Date("2026-11-16T01:00:00Z");
    assert.equal(eligibility(p, [], later).status, "closed");
    assert.equal(eligibility({ ...p, deadline: parseDeadline("2026-11-20 18:00") }, [], later).status, "available");
  });
  it("마감 시각 미기재는 당일까지 확인 필요", () =>
    assert.equal(eligibility({ ...p, deadline: parseDeadline("2026-11-10") }, [], now).status, "unknown"));
  it("시각 없는 과거 마감일은 마감", () =>
    assert.equal(eligibility({ ...p, deadline: parseDeadline("2026-11-09") }, [], now).status, "closed"));
  it("조기 마감은 미래 마감일보다 우선", () =>
    assert.equal(eligibility({ ...p, recruitment: "closed" }, [], now).status, "closed"));
  it("모집 상태 미확인은 가능이 아님", () =>
    assert.equal(eligibility({ ...p, recruitment: "unknown" }, [], now).status, "unknown"));
  it("가정 시각이 마감 전이면 조건부, 마감 후면 마감", () => {
    assert.equal(simulate(p, "2026-11-12T12:00:00+09:00", now).label, "조건부 지원 가능");
    assert.equal(simulate(p, "2026-11-16T12:00:00+09:00", now).status, "closed");
  });
  it("과거·잘못된 가정 시각을 거절", () => {
    assert.equal(simulate(p, "invalid", now).status, "unknown");
    assert.equal(simulate(p, "2020-01-01T00:00:00Z", now).status, "unknown");
  });
});
describe("원문 정규화와 비교", () => {
  it("24:00은 다음날 00:00 한국 시간", () =>
    assert.equal(parseDeadline("2026.11.22 24:00").at, "2026-11-22T15:00:00.000Z"));
  it("24시와 분 없는 시각", () => {
    assert.equal(parseDeadline("2026년 11월 22일 24시").at, "2026-11-22T15:00:00.000Z");
    assert.equal(parseDeadline("2026-11-22 18시").precision, "minute");
  });
  it("잘못된 날짜·시각을 임의 보정하지 않음", () => {
    assert.equal(parseDeadline("2026-02-30 18:00").precision, "unknown");
    assert.equal(parseDeadline("2026-11-10 24:30").precision, "date");
  });
  it("시간 없는 날짜는 시각을 만들지 않음", () => assert.equal(parseDeadline("2026-12-03").at, null));
  it("월·시급·총액 지급 단위 보존", () => {
    assert.deepEqual(parseStipend("월 220만원"), { raw: "월 220만원", amount: 2200000, unit: "month" });
    assert.equal(parseStipend("시급 12,000원").unit, "hour");
    assert.equal(parseStipend("총액 400만원").unit, "total");
  });
  it("범위·부대 비용·미기재는 확정 월액으로 바꾸지 않음", () => {
    for (const raw of ["월 200~240만원", "월 220만원 이상", "월 220만원 식대 10만원 별도", ""])
      assert.equal(parseStipend(raw).amount, null);
  });
  it("확인 시각만 바뀌면 내용 해시는 동일", () =>
    assert.equal(sourceHash(p), sourceHash({ ...p, lastCheckedAt: new Date().toISOString() })));
  it("마감 변경은 분류 입력 해시에 영향을 주지 않음", () => {
    const changed = { ...p, deadline: parseDeadline("2026-11-30 18:00") };
    assert.equal(stableHash(classificationInput(p)), stableHash(classificationInput(changed)));
  });
  it("업무 변경은 분류 입력 해시를 바꿈", () =>
    assert.notEqual(stableHash(classificationInput(p)), stableHash(classificationInput({ ...p, tasks: "다른 업무" }))));
  it("키 순서가 달라도 안정적인 해시", () => assert.equal(stableHash({ a: 1, b: 2 }), stableHash({ b: 2, a: 1 })));
  it("지원금순에서 미기재를 뒤로 정렬", () =>
    assert.equal(filterPostings(samplePostings, { sort: "stipend" }, []).at(-1)?.stipend.amount, null));
  it("기업별 여러 부서를 검색하고 관심 필터 적용", () => {
    assert.equal(filterPostings(samplePostings, { q: "온도랩" }, []).length, 2);
    assert.equal(filterPostings(samplePostings, { saved: "true" }, [p.id]).length, 1);
  });
  it("월 지원금 필터는 시간당·미기재 제외", () =>
    assert.ok(
      filterPostings(samplePostings, { stipend: "2400000" }, []).every(
        p => p.stipend.unit === "month" && p.stipend.amount! >= 2400000,
      ),
    ));
  it("원문에 없는 근거를 거절", () =>
    assert.throws(() =>
      assertEvidence(ci, { ...p.classification!, evidence: [{ field: "tasks", quote: "존재하지 않는 업무" }] }),
    ));
  it("원문과 띄어쓰기만 다른 근거는 인정", () => {
    const input = { ...ci, tasks: "결과 비교 /분석 및\n최종 보고서 작성" };
    const quote = "결과 비교/분석 및 최종 보고서 작성";
    assert.ok(assertEvidence(input, { ...p.classification!, evidence: [{ field: "tasks", quote }] }));
  });
  it("첨부 파일 글자를 근거로 인용할 수 있고, 첨부가 없으면 거절", () => {
    const evidence = [{ field: "attachment" as const, quote: "초등 수학 기초학습 문항 분류" }];
    const input = { ...ci, attachment: "1. 초등 수학 기초학습 문항 분류 및 데이터 정리 보조" };
    assert.ok(assertEvidence(input, { ...p.classification!, evidence }));
    assert.throws(() => assertEvidence(ci, { ...p.classification!, evidence }));
  });
  it("다른 필드에 있는 근거는 인정하고 필드를 바로잡음", () => {
    const input = { ...ci, qualifications: "포트폴리오 영업 업무를 주로 합니다." };
    const checked = assertEvidence(input, {
      ...p.classification!,
      evidence: [{ field: "tasks", quote: "포트폴리오 영업 업무를 주로 합니다." }],
    });
    assert.deepEqual(checked.evidence, [{ field: "qualifications", quote: "포트폴리오 영업 업무를 주로 합니다." }]);
  });
  it("공백뿐이거나 너무 짧은 근거는 거절", () =>
    assert.throws(() => assertEvidence(ci, { ...p.classification!, evidence: [{ field: "tasks", quote: "  ·  " }] })));
  describe("보조 직군 근거 검증", () => {
    const input = { ...ci, tasks: "광고 소재를 기획하고\n메타 광고 캠페인을 직접 집행합니다. 매주 SQL 조회" };
    type Claim = ClassificationOutput["secondaryEvidence"][number];
    /** Model output whose secondaryRoles are the claimed roles, in order, unless given. */
    const output = (claims: Claim[], secondaryRoles = claims.map(c => c.role)): ClassificationOutput => ({
      ...p.classification!,
      primaryRole: "기획",
      evidence: [{ field: "tasks", quote: "광고 소재를 기획하고" }],
      majors: p.classification!.majors!,
      secondaryRoles,
      secondaryEvidence: claims,
    });
    const roles = (claims: Claim[], posting = input) => verifySecondaryRoles(posting, output(claims)).secondaryRoles;
    it("원문에 있는 인용은 줄바꿈 차이를 무시하고 인정, 저장 형식에는 인용을 남기지 않음", () => {
      const checked = verifySecondaryRoles(
        input,
        output([{ role: "마케팅", quote: "기획하고 메타 광고 캠페인을 직접 집행합니다", field: "tasks" }]),
      );
      assert.deepEqual(checked.secondaryRoles, ["마케팅"]);
      assert.equal("secondaryEvidence" in checked, false);
    });
    it("인용이 없거나 원문에 없거나 너무 짧은 보조 직군은 오류 없이 뺌", () => {
      assert.deepEqual(verifySecondaryRoles(input, output([], ["마케팅"])).secondaryRoles, []);
      assert.deepEqual(roles([{ role: "마케팅", quote: "인스타그램 계정을 운영합니다", field: "tasks" }]), []);
      assert.deepEqual(roles([{ role: "마케팅", quote: "메타 광고", field: "tasks" }]), []);
    });
    it("자격사항에 적힌 업무 설명은 인정하고, 요구 역량 문장은 뺌", () => {
      const posting = {
        ...input,
        qualifications:
          "포트폴리오 영업 업무를 주로 합니다.\nPython으로 데이터 분석이 가능한 학생\n엑셀 활용 능력 우대",
      };
      assert.deepEqual(
        roles([{ role: "영업", quote: "포트폴리오 영업 업무를 주로 합니다.", field: "tasks" }], posting),
        ["영업"],
      );
      assert.deepEqual(
        roles([{ role: "데이터·AI", quote: "Python으로 데이터 분석이 가능한 학생", field: "qualifications" }], posting),
        [],
      );
      assert.deepEqual(
        roles([{ role: "경영지원", quote: "엑셀 활용 능력 우대", field: "qualifications" }], posting),
        [],
      );
    });
    it("주 직군·중복 직군은 빼고 최대 2개", () => {
      const quote = "메타 광고 캠페인을 직접 집행합니다";
      const claimed = (["기획", "마케팅", "마케팅", "영업", "디자인"] as const).map(role => ({
        role,
        quote,
        field: "tasks" as const,
      }));
      assert.deepEqual(roles(claimed), ["마케팅", "영업"]);
    });
    it("데이터·AI는 모델·파이프라인·Python 같은 작업어가 있고 모니터링·장비 제어가 아닐 때만 남김", () => {
      const tasks = [
        "MES·설비 모니터링 시스템으로 생산 데이터 기록",
        "Python을 통한 양자시스템 장비 제어",
        "Prophet 활용 통한 Monthly return forecasting 지원",
        "교육자료 검색을 위한 챗봇 개발",
      ];
      const only = (quote: string) =>
        roles([{ role: "데이터·AI", quote, field: "tasks" }], { ...input, tasks: `${input.tasks}\n${quote}` });
      for (const quote of tasks.slice(0, 3)) assert.deepEqual(only(quote), [], quote);
      assert.deepEqual(only(tasks[3]), ["데이터·AI"]);
      assert.deepEqual(only("R&D 과제 결과 보고서 작성 지원"), []);
      assert.deepEqual(only("R로 통계 모델을 만들어 수요를 예측"), ["데이터·AI"]);
    });
    it("배우는 내용·요구 경험은 모든 직군에서 빼고, 디자인·재무·회계·연구개발은 정의에 맞는 인용만 남김", () => {
      const only = (role: Claim["role"], quote: string) =>
        roles([{ role, quote, field: "tasks" }], { ...input, tasks: `${input.tasks}\n${quote}` });
      assert.deepEqual(only("금융·보험", "M&A 절차를 실습을 통해 습득합니다."), []);
      assert.deepEqual(only("데이터·AI", "SQL로 데이터를 집계하고 분석해 본 경험"), []);
      assert.deepEqual(only("디자인", "생성형 AI를 활용한 사고 시나리오 영상 제작"), []);
      assert.deepEqual(only("디자인", "영상 촬영·편집 및 홍보 콘텐츠 제작"), ["디자인"]);
      assert.deepEqual(only("재무·회계", "4. Dealer Retail Revenue Report (Monthly)"), []);
      assert.deepEqual(only("재무·회계", "월별 영업비용 마감 지원"), ["재무·회계"]);
      assert.deepEqual(only("연구개발", "산업분석 및 경쟁사 분석 실습, 리서치 결과 보고"), []);
      assert.deepEqual(only("연구개발", "광소자 설계 및 측정"), ["연구개발"]);
    });
    it("주 직군 근거가 원문에 없으면 지금처럼 오류", () =>
      assert.throws(() =>
        verifySecondaryRoles(input, { ...output([]), evidence: [{ field: "tasks", quote: "존재하지 않는 업무" }] }),
      ));
  });
  it("주 직군과 보조 직군 중복 거절", () =>
    assert.throws(() => assertEvidence(ci, { ...p.classification!, secondaryRoles: [p.classification!.primaryRole] })));
});
describe("학교 계정 정책", () => {
  const user = {
    email: "student@hanyang.ac.kr",
    email_confirmed_at: "2026-11-10",
    identities: [{ provider: "google", identity_data: { email: "student@hanyang.ac.kr", email_verified: true } }],
  };
  it("확인된 학교 Google 계정 허용", () => assert.equal(isSchoolUser(user), true));
  it("다른 도메인 거절", () => assert.equal(isSchoolUser({ ...user, email: "student@gmail.com" }), false));
  it("토큰 claims: 학교 메일 + Google 로그인만 허용", () => {
    const claims = {
      sub: "u1",
      email: "student@hanyang.ac.kr",
      app_metadata: { provider: "google", providers: ["google"] },
    };
    assert.equal(isSchoolClaims(claims), true);
    assert.equal(isSchoolClaims({ ...claims, email: "student@gmail.com" }), false);
    assert.equal(isSchoolClaims({ ...claims, app_metadata: { provider: "email", providers: ["email"] } }), false);
    assert.equal(isSchoolClaims({ ...claims, is_anonymous: true }), false);
    assert.equal(isSchoolClaims({ ...claims, sub: undefined }), false);
    assert.equal(isSchoolClaims(null), false);
  });
  it("확인되지 않은 이메일 거절", () => assert.equal(isSchoolUser({ ...user, email_confirmed_at: undefined }), false));
  it("사용자 메타데이터만으로 학교 인증 통과 불가", () =>
    assert.equal(isSchoolUser({ ...user, identities: [] }), false));
  it("유사 도메인·Google identity 불일치 거절", () => {
    assert.equal(isSchoolUser({ ...user, email: "a@hanyang.ac.kr.attacker.com" }), false);
    assert.equal(isSchoolUser({ ...user, email: "other@hanyang.ac.kr" }), false);
  });
});

describe("majorFit", () => {
  const base = samplePostings[0];
  const withMajors = (majors: NonNullable<NonNullable<typeof base.classification>["majors"]>) => ({
    ...base,
    classification: { ...base.classification!, majors },
  });
  it("지정 전공에 있으면 지원 대상, 없으면 다른 전공 대상", () => {
    const p = withMajors({ requirement: "listed", required: ["경영학부"], preferred: [], related: ["산업공학과"] });
    assert.equal(majorFit(p, "경영학부"), "required");
    assert.equal(majorFit(p, "산업공학과"), "other");
  });
  it("같은 분야 전공만 지정된 공고는 비슷한 전공 대상(내 전공 관련에 포함)", () => {
    const p = withMajors({ requirement: "listed", required: ["컴퓨터소프트웨어학부"], preferred: [], related: [] });
    assert.equal(majorFit(p, "정보공학전공"), "adjacent");
    assert.equal(majorFit(p, "국어국문학과"), "other");
    const open = { ...p, recruitment: "open" as const, deadline: { ...p.deadline, at: null, date: null } };
    assert.equal(filterPostings([open], { mine: "true" }, [], "정보공학전공").length, 1);
    assert.equal(filterPostings([open], {}, [], "국어국문학과").length, 0);
  });
  it("전공무관 공고는 우대, 관련 업무 순으로 알려줌", () => {
    const p = withMajors({ requirement: "any", required: [], preferred: ["경영학부"], related: ["산업공학과"] });
    assert.equal(majorFit(p, "경영학부"), "preferred");
    assert.equal(majorFit(p, "산업공학과"), "related");
    assert.equal(majorFit(p, "철학과"), "none");
  });
  it("전공을 고르면 다른 전공만 뽑는 공고를 숨기고, 옵션으로 다시 보여줌", () => {
    const open = { ...base, recruitment: "open" as const, deadline: { ...base.deadline, at: null, date: null } };
    const listed = {
      ...open,
      id: "listed",
      classification: {
        ...base.classification!,
        majors: { requirement: "listed" as const, required: ["경영학부" as const], preferred: [], related: [] },
      },
    };
    const any = {
      ...open,
      id: "any",
      classification: {
        ...base.classification!,
        majors: { requirement: "any" as const, required: [], preferred: [], related: [] },
      },
    };
    const ids = (filters = {}, major: "철학과" | "경영학부" | null = "철학과") =>
      filterPostings([listed, any], filters, [], major).map(p => p.id);
    assert.deepEqual(ids(), ["any"]);
    assert.deepEqual(ids({}, "경영학부").sort(), ["any", "listed"]);
    assert.deepEqual(ids({ others: "true" }).sort(), ["any", "listed"]);
    assert.deepEqual(ids({}, null).sort(), ["any", "listed"]);
  });
  it("전공을 고르지 않았거나 전공 정보가 없으면 표시하지 않음", () => {
    assert.equal(majorFit(base, null), "none");
    assert.equal(
      majorFit({ ...base, classification: { ...base.classification!, majors: undefined } }, "경영학부"),
      "none",
    );
  });
});
describe("전공 분야", () => {
  it("모든 분야의 학과는 서울캠퍼스 학과 목록에 있음", async () => {
    const { MAJOR_FIELDS, isMajor, neighborMajors } = await import("../src/lib/majors");
    for (const f of MAJOR_FIELDS) for (const m of f.majors) assert.ok(isMajor(m), m);
    assert.deepEqual(
      neighborMajors("정보공학전공").sort(),
      ["데이터사이언스학부", "정보시스템학과", "컴퓨터소프트웨어학부"].sort(),
    );
    assert.deepEqual(neighborMajors("철학과"), []);
    // 경영공학전공 bridges both fields; 산업공학과 does not reach 경영·경제·금융.
    assert.ok(neighborMajors("경영공학전공").includes("경영학부"));
    assert.ok(neighborMajors("경영공학전공").includes("산업공학과"));
    assert.ok(!neighborMajors("산업공학과").includes("경영학부"));
  });
});
