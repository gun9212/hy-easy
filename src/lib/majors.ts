// Hanyang University Seoul campus colleges and majors, copied from
// https://www.hanyang.ac.kr/s_college_department-info on 2026-11-12. Colleges whose page lists no departments
// (의과대학, 간호대학, 경제금융대학, 한양YK인터칼리지) appear as a single entry under their own name.
export const SEOUL_COLLEGES = [
  {
    college: "공과대학",
    majors: [
      "건축학부",
      "건축공학부",
      "건설환경공학과",
      "도시공학과",
      "자원환경공학과",
      "융합전자공학부",
      "컴퓨터소프트웨어학부",
      "정보시스템학과",
      "전기공학전공",
      "바이오메디컬공학전공",
      "신소재공학부",
      "화학공학과",
      "생명공학과",
      "유기나노공학과",
      "에너지공학과",
      "기계공학부",
      "원자력공학과",
      "산업공학과",
      "미래자동차공학과",
      "데이터사이언스학부",
      "반도체공학과",
    ],
  },
  { college: "의과대학", majors: ["의과대학"] },
  { college: "간호대학", majors: ["간호대학"] },
  {
    college: "인문과학대학",
    majors: ["국어국문학과", "중어중문학과", "영어영문학과", "독어독문학과", "사학과", "철학과", "미래인문학융합학부"],
  },
  { college: "사회과학대학", majors: ["정치외교학과", "사회학과", "미디어커뮤니케이션학과", "관광학부"] },
  { college: "자연과학대학", majors: ["수학과", "물리학과", "화학과", "생명과학과"] },
  { college: "정책과학대학", majors: ["정책학과", "행정학과"] },
  { college: "경제금융대학", majors: ["경제금융대학"] },
  { college: "경영대학", majors: ["경영학부", "파이낸스경영학과"] },
  {
    college: "사범대학",
    majors: ["교육학과", "교육공학과", "국어교육과", "영어교육과", "수학교육과", "응용미술교육과"],
  },
  { college: "생활과학대학", majors: ["의류학과", "식품영양학과", "실내건축디자인학과"] },
  { college: "음악대학", majors: ["성악과", "작곡과", "피아노과", "관현악과", "국악과"] },
  {
    college: "예술·체육대학",
    majors: ["스포츠매니지먼트전공", "스포츠사이언스전공", "연극영화학과", "무용학과"],
  },
  { college: "국제대학", majors: ["국제학부", "글로벌콘텐츠융합학부"] },
  { college: "기술혁신대학", majors: ["경영공학전공", "정보공학전공"] },
  { college: "한양YK인터칼리지", majors: ["한양YK인터칼리지"] },
] as const;

export const SEOUL_MAJORS = SEOUL_COLLEGES.flatMap(c => c.majors) as unknown as readonly [string, ...string[]];
export type Major = (typeof SEOUL_COLLEGES)[number]["majors"][number];

export function isMajor(value: unknown): value is Major {
  return typeof value === "string" && (SEOUL_MAJORS as readonly string[]).includes(value);
}

/** The college list as prompt text: "공과대학: 건축학부, 건축공학부, ...". */
export function majorsPromptText(): string {
  return SEOUL_COLLEGES.map(c => `${c.college}: ${c.majors.join(", ")}`).join("\n");
}

/**
 * Fields whose majors are close enough that a posting naming one usually accepts the others as "관련 전공"
 * (e.g. a posting for "컴퓨터공학" lists 컴퓨터소프트웨어학부, and 정보공학전공 students study the same subjects).
 * A major may sit in several fields. Students still have to confirm eligibility in the posting.
 */
export const MAJOR_FIELDS: readonly { field: string; majors: readonly Major[] }[] = [
  {
    field: "컴퓨터·소프트웨어",
    majors: ["컴퓨터소프트웨어학부", "정보시스템학과", "정보공학전공", "데이터사이언스학부"],
  },
  { field: "전기·전자", majors: ["융합전자공학부", "전기공학전공", "반도체공학과"] },
  { field: "기계·자동차", majors: ["기계공학부", "미래자동차공학과"] },
  { field: "화학·소재·에너지", majors: ["화학공학과", "신소재공학부", "유기나노공학과", "에너지공학과", "화학과"] },
  { field: "생명·바이오", majors: ["생명공학과", "생명과학과", "바이오메디컬공학전공"] },
  { field: "건축·도시·환경", majors: ["건축학부", "건축공학부", "건설환경공학과", "도시공학과", "자원환경공학과"] },
  { field: "산업·경영공학", majors: ["산업공학과", "경영공학전공"] },
  // 경영공학전공 also sits here: its coursework is mostly business. 산업공학과 stays out (finance/accounting postings
  // are not a near field for it, and postings for 산업공학 are mostly engineering roles a business major can't take).
  { field: "경영·경제·금융", majors: ["경영학부", "파이낸스경영학과", "경제금융대학", "경영공학전공"] },
  { field: "데이터·수학", majors: ["데이터사이언스학부", "수학과"] },
  { field: "미디어·콘텐츠", majors: ["미디어커뮤니케이션학과", "글로벌콘텐츠융합학부"] },
  { field: "교육", majors: ["교육학과", "교육공학과"] },
  { field: "정책·행정·정치", majors: ["정책학과", "행정학과", "정치외교학과"] },
];

/** Majors in the same field as `major`, excluding itself. */
export function neighborMajors(major: Major): Major[] {
  const set = new Set<Major>();
  for (const f of MAJOR_FIELDS) if (f.majors.includes(major)) f.majors.forEach(m => m !== major && set.add(m));
  return [...set];
}
