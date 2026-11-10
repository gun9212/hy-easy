import { readFile, mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import { ROLES, type ClassificationInput } from "../src/lib/domain";
import { classify, type ClassificationResult, type Provider } from "../src/lib/classifier";
const sampleSchema=z.object({id:z.string(),input:z.object({practiceInfo:z.string(),qualifications:z.string(),tasks:z.string()}),expectedRole:z.enum(ROLES),ambiguous:z.boolean()});
type Row={id:string;provider:Provider;expectedRole:string;ambiguous:boolean;grounded:boolean|null;result:ClassificationResult|null;elapsedMs:number;error:string|null};
const args=process.argv.slice(2),argument=(name:string)=>args[args.indexOf(name)+1];
if(args.includes("--report")){
  const rows:Row[]=JSON.parse(await readFile(argument("--report"),"utf8"));
  const credit=args.includes("--confirmed-credit")?Math.max(0,Number(argument("--confirmed-credit"))):0;
  const compute=args.includes("--compute-cost")?Math.max(0,Number(argument("--compute-cost"))):4.284;
  const projected=args.includes("--monthly-postings")?Math.max(1,Number(argument("--monthly-postings"))):1000;
  const candidates=(["claude","gemini"] as const).map(provider=>{
    const all=rows.filter(r=>r.provider===provider),clear=all.filter(r=>!r.ambiguous),ambiguous=all.filter(r=>r.ambiguous);
    const accuracy=clear.filter(r=>r.result?.classification.primaryRole===r.expectedRole).length/(clear.length||1),reviewRecall=ambiguous.filter(r=>r.result?.classification.needsReview).length/(ambiguous.length||1);
    const passed=clear.length===48&&ambiguous.length===12&&accuracy>=.9&&reviewRecall>=.8&&all.every(r=>r.result&&!r.error&&r.grounded===true);
    const inference=all.reduce((sum,r)=>sum+(r.result?.costUsd??0),0)/(all.length||1)*projected;
    const cash=provider==="gemini"?Math.max(0,compute+inference-credit):Math.max(0,compute-credit)+inference;
    return {provider,passed,accuracy,reviewRecall,unreviewed:all.filter(r=>r.grounded===null).length,projectedInferenceUsd:inference,projectedTotalCashUsd:cash};
  });
  const eligible=candidates.filter(c=>c.passed).sort((a,b)=>a.projectedTotalCashUsd-b.projectedTotalCashUsd||(a.provider==="claude"?-1:1));
  console.log(JSON.stringify({candidates,selected:eligible[0]?.provider??null,note:"Claude 크레딧 미적용, 실패 요청의 미확인 과금·부대 비용 별도. grounded는 사람이 원문 대조 후 true/false로 기록."},null,2));
  if(!eligible.length)process.exitCode=1;
}else{
  if(!args.includes("--file"))throw new Error("사용법: npm run evaluate -- --file <실제 공고 JSONL>. 비용 발생 호출은 --run을 명시해야 합니다.");
  const samples=(await readFile(argument("--file"),"utf8")).split(/\r?\n/).filter(Boolean).map(line=>sampleSchema.parse(JSON.parse(line)));
  if(new Set(samples.map(s=>s.id)).size!==samples.length)throw new Error("공고 ID가 중복되었습니다.");
  if(samples.length!==60||samples.filter(s=>s.ambiguous).length!==12)throw new Error("명확한 공고 48개와 모호한 공고 12개가 필요합니다.");
  if(!args.includes("--run")){console.log("60건 형식 검증 완료. 모델 호출 없음. --run을 추가하면 두 모델에 유료 요청을 보냅니다.");}
  else{
    const rows:Row[]=[];await mkdir("output/evaluations",{recursive:true});
    const path=`output/evaluations/${Date.now()}.json`;
    for(const provider of ["claude","gemini"] as const)for(const sample of samples){
      const start=Date.now();let result:ClassificationResult|null=null,error:string|null=null;
      try{result=await classify(sample.input as ClassificationInput,provider);}catch{error="MODEL_OR_VALIDATION_FAILED";}
      rows.push({id:sample.id,provider,expectedRole:sample.expectedRole,ambiguous:sample.ambiguous,grounded:null,result,error,elapsedMs:Date.now()-start});
      await writeFile(path,JSON.stringify(rows,null,2),{mode:0o600});console.log(`${provider}: ${rows.length}/120`);
    }
    console.log(`결과: ${path}. 각 grounded를 원문 대조 후 채우고 --report로 판정하세요.`);
  }
}
