import { requireAdmin, sameOrigin, errorResponse, HttpError } from "@/lib/auth";
import { assertEvidence, classificationSchema, type Posting } from "@/lib/domain";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{sameOrigin(request);const {db}=await requireAdmin(),{id}=await params;const input=classificationSchema.safeParse(await request.json());if(!input.success)throw new HttpError(400,"직군과 설명, 원문 근거를 확인해 주세요.");
    const {data,error}=await db.from("posting_view").select("document").eq("id",id).maybeSingle();if(error)throw error;if(!data)throw new HttpError(404,"공고를 찾을 수 없습니다.");
    try{assertEvidence(data.document as Posting,input.data);}catch{throw new HttpError(400,"분류 근거가 원문과 일치하지 않습니다.");}
    const result=await db.rpc("override_classification",{p_posting:id,p_result:input.data});if(result.error)throw result.error;return Response.json({ok:true});
  }catch(e){return errorResponse(e);}
}
