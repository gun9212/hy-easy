// Read-only end-to-end check of the HY-WEP adapter with a saved operator session.
// Opens the list, one list page and one detail page. Writes nothing to any database.
// Usage: npm run collector:probe
import { chmod, readFile, stat } from "node:fs/promises";
import { chromium } from "playwright";
import { needsAttachment } from "../worker/attachments";
import { fillTemplate } from "../worker/hywep-fields";
import {
  dismissDialogs,
  parseScheduleOverride,
  readAttachment,
  readDetail,
  readListPage,
  readScheduleUrls,
  selectorsSchema,
} from "../worker/adapter";
import { credentialsFromEnv, ensureSession } from "../worker/portal-login";
import { safeCollectorErrorCode } from "../worker/error-codes";

const LIST_URL = process.env.HYWEP_LIST_URL || "https://hywep.hanyang.ac.kr/compjoinsearch/list.do";
const SELECTORS_FILE = process.env.HYWEP_SELECTORS_FILE || "worker/selectors.example.json";
const STORAGE_STATE = process.env.HYWEP_STORAGE_STATE || ".secrets/hywep-state.json";
const NAVIGATION_TIMEOUT_MS = 25_000;

function preview(text: string, length = 40): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > length ? `${flat.slice(0, length)}…` : flat;
}

async function main(): Promise<void> {
  const selectors = selectorsSchema.parse(JSON.parse(await readFile(SELECTORS_FILE, "utf8")));
  const browser = await chromium.launch({ headless: true });
  try {
    // --fresh ignores the stored session to exercise the automatic portal login.
    const fresh = process.argv.includes("--fresh");
    const hasStoredSession =
      !fresh &&
      (await stat(STORAGE_STATE).then(
        () => true,
        () => false,
      ));
    const context = await browser.newContext(hasStoredSession ? { storageState: STORAGE_STATE } : {});
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    dismissDialogs(page);

    const started = Date.now();
    const credentials = credentialsFromEnv();
    const session = await ensureSession(page, selectors, LIST_URL, credentials);
    console.log(
      `세션: ${session === "reused" ? "저장된 세션 재사용" : "자동 로그인 성공"} (자격 증명 ${credentials ? "있음" : "없음"})`,
    );
    if (session === "logged_in") {
      await context.storageState({ path: STORAGE_STATE });
      await chmod(STORAGE_STATE, 0o600);
    }
    // --attachment <공고 ID>: read one posting's attached PDF (in memory) and print what the collector would store.
    const attachmentFlag = process.argv.indexOf("--attachment");
    if (attachmentFlag >= 0) {
      const id = process.argv[attachmentFlag + 1] ?? "";
      if (!/^\d+$/.test(id)) {
        console.error("사용법: npm run collector:probe -- --attachment <공고 ID>");
        throw new Error("INVALID_ATTACHMENT_ARG");
      }
      const row = { id, url: fillTemplate(selectors.detailUrlTemplate, { id }), fields: {} };
      const posting = await readDetail(page, selectors, row);
      console.log(`상세 #${id} ${posting.company} / ${posting.department}`);
      console.log(`  실습내용(${posting.tasks.length}자): ${preview(posting.tasks, 80)}`);
      console.log(`  첨부가 필요한 공고: ${needsAttachment(posting) ? "예" : "아니요"}`);
      const attachment = await readAttachment(page, selectors);
      if (!attachment) console.log("  첨부 파일 없음");
      else {
        console.log(`  파일: ${attachment.fileName} · ${attachment.pages}쪽 · ${attachment.text.length}자`);
        console.log(`  잘림: ${attachment.truncated ? "예" : "아니요"} · sha256 ${attachment.fileHash.slice(0, 12)}`);
        console.log(`  앞부분: ${preview(attachment.text, 300)}`);
      }
      return;
    }
    const scheduleUrls = await readScheduleUrls(page, selectors, parseScheduleOverride(process.env.HYWEP_SCHEDULES));
    console.log(`수집 회차 ${scheduleUrls.map(url => new URL(url).searchParams.get("schedule")).join(", ")}`);

    await page.goto(scheduleUrls[0], { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    const { rows, nextUrl } = await readListPage(page, selectors);
    console.log(`첫 회차 1페이지: ${rows.length}행, 다음 페이지 ${nextUrl ? "있음" : "없음"}`);
    for (const row of rows.slice(0, 3)) {
      const f = row.fields;
      console.log(
        `  #${row.id} ${f.company} / ${f.department} | ${f.status} | ${f.deadlineDate} ${f.deadlineTime} | ${f.stipend} | ${f.headcount}명 모집, ${f.applicants}명 지원`,
      );
    }

    const target = rows.find(row => row.fields.status === "접수중") ?? rows[0];
    if (!target) throw new Error("LIST_EMPTY");
    const posting = await readDetail(page, selectors, target);
    console.log(`상세 #${posting.sourceId}`);
    console.log(`  제목: ${posting.title} | 학기: ${posting.term} | 상태: ${posting.recruitment}`);
    console.log(`  마감: ${posting.deadline.at ?? posting.deadline.raw} (${posting.deadline.precision})`);
    console.log(
      `  지원금: ${posting.stipend.amount ?? "미확정"} (${posting.stipend.unit}) | 인원: ${posting.headcount} / 지원 ${posting.applicants}`,
    );
    console.log(`  실습내용: ${preview(posting.tasks)}`);
    console.log(`  자격사항: ${preview(posting.qualifications)}`);
    console.log(`  실습정보: ${preview(posting.practiceInfo, 80)}`);
    console.log(`소요 ${((Date.now() - started) / 1000).toFixed(1)}초`);
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(`PROBE_FAILED: ${safeCollectorErrorCode(error, "PROBE_FAILED")}`);
  process.exitCode = 1;
});
