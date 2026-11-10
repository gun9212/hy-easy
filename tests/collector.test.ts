import { it } from "node:test";
import assert from "node:assert/strict";
import { normalizeFields, sourceUrl, selectorsSchema } from "../worker/adapter";
const fields={기업명:"가상기업",부서명:"개발팀",모집직무:"백엔드 인턴",실습내용:"Java API 개발",자격사항:"SQL 기초",모집마감일:"2026-11-22 24:00",실습지원비:"월 220만원",모집상태:"모집중"};
it("한국어 표 필드를 확정 정보만 정규화",()=>{const p=normalizeFields(fields,"001","https://hywep.hanyang.ac.kr/detail?id=1");assert.equal(p.title,"백엔드 인턴");assert.equal(p.deadline.at,"2026-11-22T15:00:00.000Z");assert.equal(p.stipend.amount,2200000);assert.equal(p.recruitment,"open");assert.equal(p.classification,null);});
it("빈 실습내용과 미확인 모집 상태를 추측하지 않음",()=>{const p=normalizeFields({...fields,실습내용:"",모집상태:""},"1","https://hywep.hanyang.ac.kr/");assert.equal(p.recruitment,"unknown");assert.equal(p.tasks,"");});
it("구조가 달라 기업명을 읽지 못하면 수집 실패",()=>assert.throws(()=>normalizeFields({...fields,기업명:""},"1","https://hywep.hanyang.ac.kr/")));
it("수집 링크를 HY-WEP HTTPS로 제한",()=>{assert.throws(()=>sourceUrl("https://attacker.invalid/"));assert.throws(()=>sourceUrl("javascript:alert(1)"));assert.equal(sourceUrl("/detail?id=1"),"https://hywep.hanyang.ac.kr/detail?id=1");});
it("실제 화면 선택자는 별도 검증 플래그가 필요",()=>assert.throws(()=>selectorsSchema.parse({verified:true})));
