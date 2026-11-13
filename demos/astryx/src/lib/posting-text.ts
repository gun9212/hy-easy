/**
 * Turns HY-WEP's free-form posting text into blocks the drawer can lay out.
 * Most postings follow the school template: "*직무명 : …", "*직무개요 :" then bullets ("•", "-", "1.", "①", "1)"),
 * with "※"/"★" notices on top. Anything that does not match falls back to plain text lines, so nothing is dropped.
 */

export type Item =
  | { kind: "bullet"; marker: string | null; text: string }
  | { kind: "heading"; text: string }
  | { kind: "labeled"; label: string; text: string }
  | { kind: "text"; text: string };

export type Block =
  | { kind: "notice"; text: string }
  | { kind: "field"; label: string; items: Item[] }
  | { kind: "text"; items: Item[] };

/** Template labels; a line only opens a section when its label is one of these, so bullets like "- 6개월 근무: …" stay bullets. */
const FIELD_LABEL =
  /^(직무명|교육\s*목표|직무\s*개요|운영\s*\/\s*지도|전공|인원|학년|학점(\s*\/\s*평점)?|평점|요구\s*역량|기타\s*사항|(외국인\s*)?유학생(\s*지원(\s*여부)?)?|우대\s*사항|근무\s*(시간|지|장소|기간)|복리\s*후생|혜택)$/;
const FIELD_LINE = /^[*\-•]?\s*([^:：]{1,24}?)\s*[:：]\s*(.*)$/;
const NOTICE = /^(※|★|☆|◆|◇)\s*/;
const BULLET = /^(•|·|‧|-|–|—|\*|▪|▫|◦|○|●|■|□|▶|▷|►|✓|✔|o(?=\s))\s*/;
// "(?!\d)" keeps "3.4학년" and "3.3 이상" from reading as item 3.
const NUMBERED = /^(\(?\d{1,2}[.)](?!\d)|\(\d{1,2}\)|[①-⑳]|[가-하][.)])\s*/;
const HEADING = /^(\[[^\]]{1,40}\]|<[^>]{1,40}>|【[^】]{1,40}】)$/;
const WEEK = /^(\d{1,2}\s*(주차|주|개월|월|차)(\s*[~-]\s*\d{1,2}\s*(주차|주|개월|월|차)?)?)\s*[:：]\s*(.+)$/;

function cleanLine(line: string): string {
  return line
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)")
    .replace(/[\t ]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function stripNotice(text: string): string {
  return text
    .replace(NOTICE, "")
    .replace(/\s*(※|★)\s*$/, "")
    .trim();
}

export function parseItem(line: string): Item {
  const heading = HEADING.exec(line);
  if (heading) return { kind: "heading", text: line.slice(1, -1).trim() };
  const week = WEEK.exec(line);
  if (week) return { kind: "labeled", label: week[1].replace(/\s+/g, ""), text: week[5].trim() };
  const numbered = NUMBERED.exec(line);
  if (numbered && line.length > numbered[0].length)
    return { kind: "bullet", marker: numbered[1], text: line.slice(numbered[0].length).trim() };
  const bullet = BULLET.exec(line);
  if (bullet && line.length > bullet[0].length) {
    const rest = line.slice(bullet[0].length).trim();
    // "*1주-4주차 : 재무제표 분석" is a schedule row behind a bullet.
    return WEEK.test(rest) ? parseItem(rest) : { kind: "bullet", marker: null, text: rest };
  }
  return { kind: "text", text: line };
}

/** "*학년 : 4학년" → { label: "학년", value: "4학년" } when the label is a template label. */
export function parseField(line: string): { label: string; value: string } | null {
  const match = FIELD_LINE.exec(line);
  if (!match) return null;
  const label = match[1].replace(/^[*\-•]\s*/, "").trim();
  if (!FIELD_LABEL.test(label)) return null;
  return { label: label.replace(/\s*\/\s*/g, "/"), value: match[2].replace(/\*+$/, "").trim() };
}

export function parsePostingText(raw: string): Block[] {
  const blocks: Block[] = [];
  const append = (item: Item): void => {
    const last = blocks.at(-1);
    if (last && last.kind !== "notice") last.items.push(item);
    else blocks.push({ kind: "text", items: [item] });
  };
  for (const line of raw.replace(/\r\n?/g, "\n").split("\n").map(cleanLine)) {
    if (!line || /^[*\-•※★]+$/.test(line)) continue;
    const field = parseField(line);
    if (field) {
      blocks.push({ kind: "field", label: field.label, items: field.value ? [parseItem(field.value)] : [] });
    } else if (NOTICE.test(line) && !blocks.some(b => b.kind === "field")) {
      blocks.push({ kind: "notice", text: stripNotice(line) });
    } else {
      append(NOTICE.test(line) ? { kind: "text", text: line } : parseItem(line));
    }
  }
  return blocks.filter(b => b.kind === "notice" || b.items.length > 0 || b.kind === "field");
}

/** Longer values (a sentence of 직무개요) get their own labelled block instead of a cramped grid cell. */
const SHORT_FACT_CHARS = 24;

/** A field whose whole value is one short line ("학년: 4학년") reads best as a key-value row. */
export function isShortFact(block: Block): block is Extract<Block, { kind: "field" }> {
  if (block.kind !== "field" || block.items.length !== 1) return false;
  const [item] = block.items;
  return item.kind === "text" && item.text.length <= SHORT_FACT_CHARS;
}
