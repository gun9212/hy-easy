import { chromium } from "playwright";
import { mkdir, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import { createInterface } from "node:readline/promises";

const path=process.env.HYWEP_STORAGE_STATE||".secrets/hywep-state.json";
await mkdir(dirname(path),{recursive:true,mode:0o700});
const browser=await chromium.launch({headless:false});
try{
  const context=await browser.newContext(),page=await context.newPage();await page.goto("https://hywep.hanyang.ac.kr/",{waitUntil:"domcontentloaded"});
  const rl=createInterface({input:process.stdin,output:process.stdout});await rl.question("브라우저에서 직접 로그인하고 공고 목록을 연 뒤 Enter를 누르세요. 비밀번호는 저장하지 않습니다. ");rl.close();
  await context.storageState({path});await chmod(path,0o600);console.log("운영자 세션을 로컬 비공개 파일에 저장했습니다. 실제 수집 전 선택자를 검증하세요.");
}finally{await browser.close();}
