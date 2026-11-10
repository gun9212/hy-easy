"use client";
import { useState } from "react";
import { ROLES, type Posting, type Role, type Classification } from "@/lib/domain";
export function AdminEditor({posting:p}:{posting:Posting}){
  const [role,setRole]=useState<Role>(p.classification?.primaryRole??"기타"),[summary,setSummary]=useState(p.classification?.summary??""),[review,setReview]=useState(p.classification?.needsReview??true),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  return <details className="admin-edit"><summary>{p.company} · {p.title} {(p.classificationStale||p.classification?.needsReview||!p.classification)&&" · 검토 필요"}</summary><pre>실습정보: {p.practiceInfo}{"\n\n"}자격사항: {p.qualifications}{"\n\n"}실습내용: {p.tasks}</pre><form onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage("");try{
    const field=(["tasks","practiceInfo","qualifications"] as const).find(f=>p[f].trim());if(!field)throw new Error("원문 근거가 없습니다.");
    const result:Classification={primaryRole:role,secondaryRoles:[],summary,evidence:[{field,quote:p[field].slice(0,300)}],needsReview:review};
    const response=await fetch(`/api/admin/classification/${p.id}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(result)});const data=await response.json();if(!response.ok)throw new Error(data.error);setMessage("수정 내용을 저장했습니다.");
  }catch(e){setMessage(e instanceof Error?e.message:"저장 실패");}finally{setBusy(false);}}}><label className="form-field">주 직군<select value={role} onChange={e=>setRole(e.target.value as Role)}>{ROLES.map(r=><option key={r}>{r}</option>)}</select></label><label className="form-field">업무 설명<textarea required maxLength={500} value={summary} onChange={e=>setSummary(e.target.value)}/></label><label className="check-label"><input type="checkbox" checked={review} onChange={e=>setReview(e.target.checked)}/>추가 검토 필요</label><br/><button className="primary-button" disabled={busy}>{busy?"저장 중…":"분류 수정 저장"}</button><p className="muted small" role="status">{message}</p></form></details>;
}
