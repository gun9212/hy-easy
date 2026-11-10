import { z } from "zod";
import type { Page } from "playwright";
import { parseDeadline, parseStipend } from "../src/lib/normalize";
import type { Posting } from "../src/lib/domain";
export const selectorsSchema=z.object({verified:z.boolean(),authenticated:z.string().min(1),listReady:z.string().min(1),emptyList:z.string().min(1),listRow:z.string().min(1),detailLink:z.string().min(1),sourceIdAttribute:z.string().min(1),nextPage:z.string().min(1),nextDisabled:z.string().min(1),detailReady:z.string().min(1),detailRows:z.string().min(1),label:z.string().min(1),value:z.string().min(1)});
export type Selectors=z.infer<typeof selectorsSchema>;
export function sourceUrl(raw:string,base="https://hywep.hanyang.ac.kr/"){
  const url=new URL(raw,base);
  if(url.protocol!=="https:"||url.hostname!=="hywep.hanyang.ac.kr"||url.username||url.password)throw new Error("UNTRUSTED_SOURCE_URL");
  return url.toString();
}
export class SessionExpired extends Error{constructor(){super("SESSION_EXPIRED");}}
export async function assertSession(page:Page,s:Selectors){if(!await page.locator(s.authenticated).count())throw new SessionExpired();}
export async function readPageLinks(page:Page,s:Selectors){
  await assertSession(page,s);
  if(!await page.locator(s.listReady).count())throw new Error("LIST_STRUCTURE_CHANGED");
  const rows=page.locator(s.listRow),count=await rows.count(),links:{id:string;url:string}[]=[];
  if(!count&&!await page.locator(s.emptyList).count())throw new Error("LIST_NOT_CONFIRMED_EMPTY");
  for(let i=0;i<count;i++){
    const row=rows.nth(i),id=await row.getAttribute(s.sourceIdAttribute),href=await row.locator(s.detailLink).getAttribute("href");
    if(!id||!href)throw new Error("SOURCE_ID_OR_DETAIL_LINK_MISSING");
    links.push({id,url:sourceUrl(href,page.url())});
  }
  const next=page.locator(s.nextPage).first();let nextUrl:string|null=null;
  if(await next.count()&&!await next.evaluate((el,selector)=>el.matches(selector),s.nextDisabled)){
    const href=await next.getAttribute("href");if(!href)throw new Error("NEXT_PAGE_LINK_MISSING");nextUrl=sourceUrl(href,page.url());
  }
  return {links,nextUrl};
}
export function normalizeFields(fields:Record<string,string>,id:string,url:string,checkedAt=new Date().toISOString()):Posting{
  const get=(...labels:string[])=>labels.map(k=>fields[k]).find(v=>v?.trim())?.trim()??"";
  const company=get("기업명","기관명","실습기관명"),department=get("부서명","실습부서","부서"),title=get("모집직무","직무명","실습직무")||department;
  const tasks=get("실습내용","실습 내용","직무내용"),practiceInfo=get("실습정보","실습 정보","실습목표"),qualifications=get("자격사항","지원자격","자격요건");
  if(!company||!title||(!tasks&&!practiceInfo&&!qualifications))throw new Error("DETAIL_REQUIRED_FIELDS_MISSING");
  const recruitmentRaw=get("모집상태","접수상태"),closed=/^(모집\s*마감|접수\s*마감|마감|종료)$/.test(recruitmentRaw),open=/^(모집\s*중|접수\s*중|모집중|접수중)$/.test(recruitmentRaw);
  const count=get("모집인원","선발인원").match(/^(\d+)\s*명?$/);
  return {
    id:"",sourceId:id,sourceUrl:sourceUrl(url),company,department,title,term:get("모집학기","학기","실습학기"),location:get("실습장소","근무지역","소재지"),period:get("실습기간","실습 기간"),headcount:count?Number(count[1]):null,
    stipend:parseStipend(get("실습지원비","실습지원금","지원금")),deadline:parseDeadline(get("모집마감","모집마감일","모집기간마감","지원마감일","마감일")),recruitment:closed?"closed":open?"open":"unknown",
    practiceInfo,qualifications,tasks,benefits:get("복리후생","기타지원사항"),
    events:["서류발표","면접일","최종발표"].filter(k=>fields[k]).map(k=>({label:k,raw:fields[k]})),
    firstSeenAt:checkedAt,updatedAt:checkedAt,lastCheckedAt:checkedAt,classification:null,classificationSource:null,classificationStale:false,
  };
}
export async function readDetail(page:Page,s:Selectors,id:string,url:string){
  await page.goto(sourceUrl(url),{waitUntil:"domcontentloaded",timeout:25_000});await assertSession(page,s);
  if(!await page.locator(s.detailReady).count())throw new Error("DETAIL_STRUCTURE_CHANGED");
  const fields:Record<string,string>={},rows=page.locator(s.detailRows);
  for(let i=0;i<await rows.count();i++){
    const labels=rows.nth(i).locator(s.label),values=rows.nth(i).locator(s.value);
    for(let j=0;j<await labels.count();j++){
      if(j>=await values.count())throw new Error("DETAIL_LABEL_VALUE_MISMATCH");
      const label=(await labels.nth(j).innerText()).replace(/\s+/g,"").replace(/[:：]$/,"");
      const value=(await values.nth(j).innerText()).trim();if(fields[label]&&fields[label]!==value)throw new Error("DETAIL_DUPLICATE_LABEL");fields[label]=value;
    }
  }
  return normalizeFields(fields,id,url);
}
