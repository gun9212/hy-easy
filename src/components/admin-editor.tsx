"use client";
import { useState } from "react";
import { ROLES, type Posting, type Role, type Classification } from "@/lib/domain";

function reasonOf(p: Posting): string {
  if (!p.classification) return "미분류";
  if (p.classificationStale) return "원문 변경";
  return "AI 검토 요청";
}

async function save(p: Posting, role: Role, summary: string, review: boolean): Promise<void> {
  const field = (["tasks", "practiceInfo", "qualifications"] as const).find(f => p[f].trim());
  if (!field) throw new Error("원문 근거가 없습니다.");
  const result: Classification = {
    primaryRole: role,
    // Keep the AI's secondary roles; drop one that is now the primary role.
    secondaryRoles: (p.classification?.secondaryRoles ?? []).filter(r => r !== role),
    summary,
    evidence: [{ field, quote: p[field].slice(0, 300) }],
    needsReview: review,
    // Keep the AI's major mapping; the editor changes only the role, summary and review flag.
    ...(p.classification?.majors ? { majors: p.classification.majors } : {}),
  };
  const response = await fetch(`/api/admin/classification/${p.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error((data as { error?: string } | null)?.error ?? "저장하지 못했습니다.");
}

export function AdminEditor({ posting: p }: { posting: Posting }) {
  const [role, setRole] = useState<Role>(p.classification?.primaryRole ?? "기타"),
    [summary, setSummary] = useState(p.classification?.summary ?? ""),
    [review, setReview] = useState(p.classification?.needsReview ?? true),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const sources: [string, string][] = [
    ["실습내용", p.tasks],
    ["자격사항", p.qualifications],
    ["실습정보", p.practiceInfo],
    ...(p.attachment ? ([["첨부 파일에서 읽은 내용", p.attachment.text]] as [string, string][]) : []),
  ];
  return (
    <details className="admin-edit">
      <summary>
        <span className="admin-edit-title">
          <b>{p.company}</b>
          <small>{p.title}</small>
        </span>
        <span className="role-tag">{p.classification?.primaryRole ?? "분류 없음"}</span>
        <span className="role-tag review">{reasonOf(p)}</span>
      </summary>
      <div className="admin-edit-body">
        <div className="admin-source">
          {sources.map(([label, text]) => (
            <section key={label}>
              <h3>{label}</h3>
              <p>{text || "원문 미기재"}</p>
            </section>
          ))}
        </div>
        <form
          className="admin-form"
          onSubmit={async e => {
            e.preventDefault();
            setBusy(true);
            setMessage("");
            try {
              await save(p, role, summary, review);
              setMessage("저장했습니다. 새로고침하면 목록에 반영됩니다.");
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "저장하지 못했습니다.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="form-field">
            주 직군
            <select value={role} onChange={e => setRole(e.target.value as Role)}>
              {ROLES.map(r => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="form-field">
            업무 설명
            <textarea required maxLength={500} rows={4} value={summary} onChange={e => setSummary(e.target.value)} />
          </label>
          <label className="check-label">
            <input type="checkbox" checked={review} onChange={e => setReview(e.target.checked)} />
            추가 검토가 더 필요해요
          </label>
          <button className="primary-button" disabled={busy}>
            {busy ? "저장 중…" : "분류 저장"}
          </button>
          <p className="admin-form-status" role="status">
            {message}
          </p>
        </form>
      </div>
    </details>
  );
}
