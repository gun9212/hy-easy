import { z } from "zod";
import { requireUser, sameOrigin, errorResponse, HttpError } from "@/lib/auth";
import { APPLICATION_STATUSES } from "@/lib/domain";
const schema=z.object({postingId:z.uuid(),status:z.enum(APPLICATION_STATUSES),confirmed:z.boolean().default(false)}).strict();
export async function POST(request:Request){
  try{sameOrigin(request);const {db}=await requireUser();const input=schema.safeParse(await request.json());if(!input.success)throw new HttpError(400,"공고와 지원 상태를 확인해 주세요.");
    if(input.data.status==="rejected"&&!input.data.confirmed)throw new HttpError(400,"HY-WEP 탈락 처리 완료를 확인한 뒤 기록해 주세요.");
    const {error}=await db.rpc("record_application",{p_posting:input.data.postingId,p_status:input.data.status});
    if(error?.code==="23505")throw new HttpError(409,"다른 기업의 지원이 진행 중입니다. HY-WEP 탈락 처리 완료를 먼저 기록해 주세요.");
    if(error)throw error;return Response.json({ok:true});
  }catch(e){return errorResponse(e);}
}
