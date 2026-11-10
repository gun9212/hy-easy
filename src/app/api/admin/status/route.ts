import { requireAdmin, errorResponse } from "@/lib/auth";
export async function GET(){try{const {db}=await requireAdmin();const {data,error}=await db.from("collector_runs").select("*").order("started_at",{ascending:false}).limit(30);if(error)throw error;return Response.json({runs:data},{headers:{"Cache-Control":"private, no-store"}});}catch(e){return errorResponse(e);}}
