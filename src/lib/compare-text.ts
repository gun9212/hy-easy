import { parsePostingText, type Block, type Item } from "./posting-text";

/**
 * Lines up the school template's sections across postings for the side-by-side table: every posting's "교육목표"
 * lands in one row, its "직무개요" in the next, and so on. Text outside any template section goes to a final
 * catch-all row, so nothing is dropped. A posting without a section gets an empty cell in that row.
 */
export type SectionRow = { label: string; cells: string[] };

/** Rows in reading order (by key); keys not listed here follow in the order they first appear. */
const ORDER = ["직무개요", "교육목표", "운영/지도", "전공", "학년", "학점", "인원", "요구역량", "우대사항", "기타사항"];
/** The table header already shows the job title. */
const SKIPPED = new Set(["직무명"]);
export const OTHER_LABEL = "그 밖의 내용";

/** One key per section however a posting spells it: "교육 목표" = "교육목표", "학점/평점" = "평점" = "학점". */
function sectionKey(label: string): string {
  const key = label.replace(/\s+/g, "");
  if (/^(학점|평점|학점\/평점)$/.test(key)) return "학점";
  if (key.includes("유학생")) return "유학생";
  return key;
}
const DISPLAY: Record<string, string> = { 학점: "학점", 유학생: "유학생 지원" };

function itemLine(item: Item): string {
  if (item.kind === "bullet") return `${item.marker ?? "•"} ${item.text}`;
  if (item.kind === "labeled") return `${item.label}: ${item.text}`;
  return item.text;
}

function blockText(block: Block): string {
  const text = block.kind === "notice" ? `※ ${block.text}` : block.items.map(itemLine).join("\n");
  // Some postings wrap a pasted block in quotes ("1주차 … 24주차: …").
  return text.replace(/^"\s*/, "").replace(/\s*"$/, "");
}

function sections(raw: string, labels: Map<string, string>): Map<string, string> {
  const byKey = new Map<string, string[]>();
  for (const block of parsePostingText(raw)) {
    const label = block.kind === "field" ? block.label : OTHER_LABEL;
    const key = block.kind === "field" ? sectionKey(label) : OTHER_LABEL;
    const text = blockText(block);
    if (SKIPPED.has(key) || !text) continue;
    if (!labels.has(key)) labels.set(key, DISPLAY[key] ?? label);
    byKey.set(key, [...(byKey.get(key) ?? []), text]);
  }
  return new Map([...byKey].map(([key, texts]) => [key, texts.join("\n")]));
}

export function compareSections(texts: readonly string[]): SectionRow[] {
  const labels = new Map<string, string>();
  const parsed = texts.map(text => sections(text ?? "", labels));
  const seen = [...labels.keys()];
  const rank = (key: string) => {
    if (key === OTHER_LABEL) return Number.MAX_SAFE_INTEGER;
    const i = ORDER.indexOf(key);
    return i === -1 ? ORDER.length + seen.indexOf(key) : i;
  };
  const rows = seen
    .sort((a, b) => rank(a) - rank(b))
    .map(key => ({ label: labels.get(key) ?? key, cells: parsed.map(map => map.get(key) ?? "") }));
  // With no template section anywhere, the catch-all row is simply the whole text.
  return rows.length === 1 && rows[0].label === OTHER_LABEL ? [{ ...rows[0], label: "원문" }] : rows;
}
