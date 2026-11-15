import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clipText,
  isPdf,
  isReadable,
  needsAttachment,
  parseFileDown,
  toAttachment,
  withAttachment,
} from "../worker/attachments";
import { samplePostings } from "../src/lib/sample";
import type { PostingAttachment } from "../src/lib/domain";

/** A one-page PDF with the given ASCII lines (Helvetica). pdf.js tolerates the approximate xref offsets. */
function tinyPdf(lines: string[]): Uint8Array {
  const content = ["BT", "/F1 10 Tf", "40 760 Td", ...lines.flatMap(l => [`(${l}) Tj`, "0 -14 Td"]), "ET"].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

const link = { jidSeq: "22451", orgName: "운영계획서", fakeName: "abc.pdf", ext: "pdf" };
const words = Array.from({ length: 12 }, (_, i) => `Line ${i + 1} intern tasks content editing review support`);

describe("첨부가 필요한 공고 판별", () => {
  it("실습내용이 첨부 참고 한 줄뿐이면 읽음", () => {
    assert.equal(
      needsAttachment({ tasks: "**자격 요건 및 실습 내용, 근무지 등은 모집공고 추가자료 파일 참고**" }),
      true,
    );
    assert.equal(needsAttachment({ tasks: "모집 공고 추가 자료 참고 (부서별 상이)" }), true);
    assert.equal(needsAttachment({ tasks: "붙임 파일 확인" }), true);
  });
  it("본문이 충분하면 첨부 문구가 있어도 읽지 않음", () => {
    const long = `*직무명: 콘텐츠 인턴 *교육목표: ${"영상 편집과 썸네일 제작을 배웁니다. ".repeat(8)} *직무개요: 첨부 파일 확인`;
    assert.equal(needsAttachment({ tasks: long }), false);
  });
  it("첨부 언급이 없으면 읽지 않음", () => {
    assert.equal(needsAttachment({ tasks: "웹 서비스 개발" }), false);
  });
});

describe("첨부 링크와 파일 검사", () => {
  it("fileDown 호출에서 네 인자를 꺼냄", () => {
    assert.deepEqual(parseFileDown("javaScript:fileDown('22451', '2026년 겨울학기 모집', 'd4c0.pdf', 'pdf')"), {
      jidSeq: "22451",
      orgName: "2026년 겨울학기 모집",
      fakeName: "d4c0.pdf",
      ext: "pdf",
    });
    assert.equal(parseFileDown("javascript:;"), null);
    assert.equal(parseFileDown(null), null);
  });
  it("PDF 머리 바이트와 읽을 수 있는 글자를 확인", () => {
    assert.equal(isPdf(new TextEncoder().encode("%PDF-1.7 ...")), true);
    assert.equal(isPdf(new TextEncoder().encode("<html>")), false);
    assert.equal(isReadable("짧은 글"), false);
    assert.equal(isReadable("직무 개요와 교육 목표 ".repeat(30)), true);
    assert.equal(isReadable("@#$%^&*()_+=~ 1234567890 ".repeat(20)), false);
  });
  it("공백을 줄이고 길면 자름", () => {
    assert.deepEqual(clipText("a   b\n\n\n\nc  "), { text: "a b\n\nc", truncated: false });
    assert.deepEqual(clipText("가".repeat(30), 10), { text: "가".repeat(10), truncated: true });
  });
});

describe("PDF 글자 추출", () => {
  it("PDF에서 글자를 그대로 꺼내고 파일 지문을 남김", async () => {
    const attachment = await toAttachment(link, tinyPdf(words), new Date("2026-11-15T00:00:00Z"));
    assert.equal(attachment.pages, 1);
    assert.match(attachment.text, /Line 1 intern tasks/);
    assert.match(attachment.text, /Line 12 intern tasks/);
    assert.equal(attachment.fileName, "운영계획서.pdf");
    assert.match(attachment.fileHash, /^[0-9a-f]{64}$/);
    assert.equal(attachment.extractedAt, "2026-11-15T00:00:00.000Z");
  });
  it("PDF가 아니거나 글자가 거의 없으면 거절", async () => {
    await assert.rejects(toAttachment({ ...link, ext: "hwp" }, tinyPdf(words)), /ATTACHMENT_NOT_PDF/);
    await assert.rejects(toAttachment(link, new TextEncoder().encode("<html></html>")), /ATTACHMENT_NOT_PDF/);
    await assert.rejects(toAttachment(link, tinyPdf(["short"])), /ATTACHMENT_UNREADABLE/);
  });
});

describe("수집 단계 연결", () => {
  const stored: PostingAttachment = {
    fileName: "old.pdf",
    fileHash: "h",
    pages: 1,
    text: "이전에 읽은 내용",
    truncated: false,
    extractedAt: "2026-11-14T00:00:00Z",
  };
  const pointing = { ...samplePostings[0], tasks: "실습 내용은 모집공고 추가자료 파일 참고" };
  const fresh = { ...stored, fileName: "new.pdf" };

  it("필요한 공고에만 첨부를 붙임", async () => {
    let reads = 0;
    const read = async () => (reads++, fresh);
    assert.equal((await withAttachment(samplePostings[0], read, async () => null)).attachment, undefined);
    assert.equal(reads, 0);
    assert.equal((await withAttachment(pointing, read, async () => null)).attachment?.fileName, "new.pdf");
  });
  it("읽기에 실패하면 전에 저장한 첨부를 유지", async () => {
    const failing = async () => {
      throw new Error("ATTACHMENT_HTTP_500");
    };
    assert.equal((await withAttachment(pointing, failing, async () => stored)).attachment?.fileName, "old.pdf");
    assert.equal((await withAttachment(pointing, failing, async () => null)).attachment, undefined);
  });
  it("첨부 파일이 없는 공고는 그대로", async () => {
    assert.equal(
      (
        await withAttachment(
          pointing,
          async () => null,
          async () => stored,
        )
      ).attachment,
      undefined,
    );
  });
});
