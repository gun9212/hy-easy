import { it } from "node:test";
import assert from "node:assert/strict";
import { modelPayload, parseModelResponse, estimateCost } from "../src/lib/classifier";
import { samplePostings } from "../src/lib/sample";
import { classificationInput } from "../src/lib/normalize";
const p=samplePostings[0],input=classificationInput(p),result=p.classification!;
function response(stop="end_turn",classification=result){return {stop_reason:stop,content:[{type:"thinking"},{type:"text",text:JSON.stringify(classification)}],usage:{input_tokens:3000,output_tokens:500}};}
it("Haiku는 thinking 비활성화·구조화 출력·도구 없음",()=>{const payload=modelPayload("claude",input);assert.equal(payload.thinking?.type,"disabled");assert.equal(payload.output_config?.format.type,"json_schema");assert.equal("tools" in payload,false);assert.equal("temperature" in payload,false);});
it("text 블록을 타입으로 찾아 분류 결과 파싱",()=>assert.deepEqual(parseModelResponse("claude",input,response()).classification,result));
it("거절·출력 잘림을 정상 결과로 저장하지 않음",()=>{for(const stop of ["refusal","max_tokens"])assert.throws(()=>parseModelResponse("claude",input,response(stop)));});
it("스키마 위반 또는 원문과 다른 근거를 거절",()=>{assert.throws(()=>parseModelResponse("claude",input,response("end_turn",{...result,primaryRole:"없는 직군"} as never)));assert.throws(()=>parseModelResponse("claude",input,response("end_turn",{...result,evidence:[{field:"tasks",quote:"환각"}]})));});
it("Gemini의 thought 블록을 설명으로 노출하지 않음",()=>{const parsed=parseModelResponse("gemini",input,{candidates:[{finishReason:"STOP",content:{parts:[{thought:true,text:"hidden"},{text:JSON.stringify(result)}]}}],usageMetadata:{promptTokenCount:3000,candidatesTokenCount:500,thoughtsTokenCount:50}});assert.equal(parsed.outputTokens,550);assert.equal(parsed.classification.summary,result.summary);});
it("대량 입력과 빈 입력을 잘라 분류하지 않고 검토로 보냄",()=>{assert.throws(()=>modelPayload("claude",{practiceInfo:"",tasks:"",qualifications:""}));assert.throws(()=>modelPayload("claude",{...input,tasks:"가".repeat(30000)}));});
it("정가와 긴 입력 구간 비용 계산",()=>{assert.equal(estimateCost("claude",3000000,500000),2.75);assert.equal(estimateCost("claude",3000,500),.00055);assert.equal(estimateCost("gemini",3000,500),.00215);});
