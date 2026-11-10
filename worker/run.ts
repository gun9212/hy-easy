import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { GoogleAuth } from "google-auth-library";
import { z } from "zod";
import { classificationInput, sourceHash, stableHash } from "../src/lib/normalize";
import { classify, type Provider } from "../src/lib/classifier";
import type { Posting } from "../src/lib/domain";
import {
  dismissDialogs,
  parseScheduleOverride,
  readDetail,
  readListPage,
  readScheduleUrls,
  selectorsSchema,
  SessionExpired,
  sourceUrl,
} from "./adapter";
import { credentialsFromEnv, ensureSession, LoginFailed } from "./portal-login";
import { listRowHash } from "./hywep-fields";
import { planListSync } from "./list-sync";

const MAX_LOGIN_FAILURES = 3;

const config = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    HYWEP_LIST_URL: z.url(),
    HYWEP_SELECTORS_FILE: z.string().min(1),
  })
  .parse(process.env);
const selectors = selectorsSchema.parse(JSON.parse(await readFile(config.HYWEP_SELECTORS_FILE, "utf8")));
if (!selectors.verified)
  throw new Error("SELECTORS_NOT_VERIFIED: 실제 로그인 화면에서 선택자를 검증한 뒤 verified=true로 설정하세요.");
const startUrl = sourceUrl(config.HYWEP_LIST_URL),
  db = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const startedAt = Date.now(),
  owner = randomUUID(),
  deadline = startedAt + 210_000;
const check = <T extends { error: unknown }>(result: T): T => {
  if (result.error) throw result.error;
  return result;
};
const lock = check(await db.rpc("acquire_collector_lock", { p_owner: owner }));
if (!lock.data) {
  console.log("Another collection is running; skipped.");
  process.exit(0);
}
const runId = owner;
check(await db.from("collector_runs").insert({ id: runId }));
// A pending item keeps its list row: status, deadline and counts only exist on the list page.
const pendingSchema = z.object({ id: z.string(), url: z.string(), fields: z.record(z.string(), z.string()) });
const stateSchema = z.object({
  schedulesLoaded: z.boolean(),
  queue: z.array(z.string()),
  pending: z.array(pendingSchema),
  seenPages: z.array(z.string()),
  seenIds: z.array(z.string()),
});
type State = z.infer<typeof stateSchema>;
let checked = 0,
  changed = 0,
  detailsRead = 0,
  status = "success",
  errorCode: string | null = null,
  leaseLost = false;
const heartbeat = setInterval(() => {
  void db
    .from("collector_locks")
    .update({ expires_at: new Date(Date.now() + 480_000).toISOString() })
    .eq("name", "hywep")
    .eq("owner", owner)
    .select("owner")
    .then(r => {
      if (r.error || !r.data?.length) leaseLost = true;
    });
}, 30_000);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let state: State = { schedulesLoaded: false, queue: [], pending: [], seenPages: [], seenIds: [] };
try {
  const stored = check(await db.from("collector_state").select("value").eq("name", "hywep").maybeSingle()).data;
  if (stored?.value && Object.keys(stored.value).length) state = stateSchema.parse(stored.value);
  let storageState: string | Parameters<Awaited<ReturnType<typeof chromium.launch>>["newContext"]>[0];
  const bucket = process.env.HYWEP_SESSION_BUCKET;
  if (bucket) {
    const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/devstorage.read_only"] }),
      client = await auth.getClient();
    const result = await client.request({
      url: `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(process.env.HYWEP_SESSION_OBJECT || "hywep-state.json")}?alt=media`,
      timeout: 15_000,
    });
    storageState = result.data as Parameters<Awaited<ReturnType<typeof chromium.launch>>["newContext"]>[0];
  } else storageState = process.env.HYWEP_STORAGE_STATE || ".secrets/hywep-state.json";
  browser = await chromium.launch({ headless: true });
  // Storage state contains cookies/localStorage only and is never logged.
  const context = await browser.newContext({
    storageState: storageState as Exclude<Parameters<typeof browser.newContext>[0], undefined>["storageState"],
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  dismissDialogs(page);
  // Stop retrying the password after 3 consecutive login failures to avoid locking the operator account.
  const recent =
    check(
      await db
        .from("collector_runs")
        .select("error_code")
        .neq("id", runId)
        .order("started_at", { ascending: false })
        .limit(MAX_LOGIN_FAILURES),
    ).data ?? [];
  const loginBlocked = recent.length === MAX_LOGIN_FAILURES && recent.every(r => r.error_code === "LOGIN_FAILED");
  await ensureSession(page, selectors, startUrl, loginBlocked ? null : credentialsFromEnv());
  const visited = new Set(state.seenIds);
  while (Date.now() < deadline - 30_000) {
    if (leaseLost) throw new Error("COLLECTOR_LEASE_LOST");
    if (state.pending.length) {
      const link = state.pending[0];
      try {
        const posting = await readDetail(page, selectors, link);
        if (leaseLost) throw new Error("COLLECTOR_LEASE_LOST");
        const result = check(
          await db.rpc("sync_posting", {
            p_document: posting,
            p_content_hash: sourceHash(posting),
            p_classification_hash: stableHash(classificationInput(posting)),
          }),
        );
        check(await db.rpc("mark_detail_checked", { p_source_id: link.id, p_list_hash: listRowHash(link.fields) }));
        checked++;
        detailsRead++;
        if (result.data) changed++;
      } catch (e) {
        if (e instanceof SessionExpired || leaseLost) throw e;
        status = "partial";
        errorCode = "DETAIL_READ_FAILED";
      }
      state.pending.shift();
      visited.add(link.id);
      state.seenIds = [...visited];
    } else if (state.queue.length) {
      const url = sourceUrl(state.queue[0]);
      if (state.seenPages.includes(url)) throw new Error("PAGINATION_LOOP");
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
      const result = await readListPage(page, selectors);
      state.seenPages.push(url);
      state.queue = [...(result.nextUrl ? [result.nextUrl] : []), ...state.queue.slice(1)];
      // Only new, list-changed or stale (>24h) rows open a detail page; the rest just refresh counts.
      const rows = result.rows.filter(r => !visited.has(r.id));
      const known =
        check(
          await db
            .from("postings")
            .select("source_id,list_hash,detail_checked_at")
            .in(
              "source_id",
              rows.map(r => r.id),
            ),
        ).data ?? [];
      const plan = planListSync(
        rows,
        new Map(known.map(k => [k.source_id, { listHash: k.list_hash, detailCheckedAt: k.detail_checked_at }])),
      );
      if (plan.touch.length) {
        check(await db.rpc("touch_postings", { p_items: plan.touch }));
        checked += plan.touch.length;
      }
      for (const t of plan.touch) visited.add(t.source_id);
      state.seenIds = [...visited];
      state.pending = plan.detail.map(d => d.row);
    } else if (!state.schedulesLoaded) {
      // The list page shows one card per open term (schedule); each term is paged separately.
      await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 25_000 });
      state.queue = await readScheduleUrls(page, selectors, parseScheduleOverride(process.env.HYWEP_SCHEDULES));
      state.schedulesLoaded = true;
    } else break;
    // A posting missing from the list is never interpreted as closure; it is simply left unchanged.
    // Checkpoint after every successful list/detail operation, before process termination.
    check(await db.from("collector_state").upsert({ name: "hywep", value: state }));
  }
  const complete = state.schedulesLoaded && !state.pending.length && !state.queue.length;
  check(await db.from("collector_state").upsert({ name: "hywep", value: complete ? {} : state }));
  if (!complete) {
    status = "partial";
    errorCode ??= "CHECKPOINT_SAVED";
  }
  if (process.env.AI_CLASSIFICATION_ENABLED === "true") {
    const provider = z.enum(["claude", "gemini"]).parse(process.env.MODEL_PROVIDER || "claude") as Provider;
    const queue =
      check(await db.from("classification_queue").select("*").lt("attempts", 3).order("updated_at").limit(5)).data ??
      [];
    for (const job of queue) {
      if (Date.now() > deadline - 35_000 || leaseLost) break;
      try {
        const row = check(
          await db.from("postings").select("document,classification_hash").eq("id", job.posting_id).single(),
        ).data;
        if (!row || row.classification_hash !== job.input_hash) continue;
        const result = await classify(classificationInput(row.document as Posting), provider);
        check(
          await db.from("classifications").upsert({
            posting_id: job.posting_id,
            result: result.classification,
            input_hash: job.input_hash,
            provider,
            model: result.model,
            prompt_version: result.promptVersion,
            taxonomy_version: result.taxonomyVersion,
            input_tokens: result.inputTokens,
            output_tokens: result.outputTokens,
            cost_usd: result.costUsd,
            created_at: new Date().toISOString(),
          }),
        );
        check(
          await db
            .from("classification_queue")
            .delete()
            .eq("posting_id", job.posting_id)
            .eq("input_hash", job.input_hash),
        );
      } catch {
        check(
          await db
            .from("classification_queue")
            .update({
              attempts: job.attempts + 1,
              last_error: "CLASSIFICATION_REQUIRES_REVIEW",
              updated_at: new Date().toISOString(),
            })
            .eq("posting_id", job.posting_id)
            .eq("input_hash", job.input_hash),
        );
      }
    }
  }
} catch (e) {
  if (e instanceof LoginFailed) {
    status = "session_expired";
    errorCode = "LOGIN_FAILED";
  } else {
    status = e instanceof SessionExpired ? "session_expired" : "failed";
    errorCode = e instanceof SessionExpired ? "SESSION_EXPIRED" : "COLLECTION_FAILED";
  }
} finally {
  clearInterval(heartbeat);
  await browser?.close();
  const final = await db
    .from("collector_runs")
    .update({ status, finished_at: new Date().toISOString(), checked, changed, error_code: errorCode })
    .eq("id", runId);
  const released = await db.rpc("release_collector_lock", { p_owner: owner });
  console.log(
    JSON.stringify({
      status,
      checked,
      changed,
      detailsRead,
      elapsedSec: Math.round((Date.now() - startedAt) / 1000),
      errorCode,
      recorded: !final.error,
      released: !released.error,
    }),
  );
}
if (status === "failed" || status === "session_expired") process.exitCode = 1;
