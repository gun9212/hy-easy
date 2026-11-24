import { redirect } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { assertDbSchoolUser, requireUser, HttpError } from "@/lib/auth";
import { loadPersonal } from "@/lib/data";
import { normalizeFilters } from "@/lib/domain";
import { isMajor } from "@/lib/majors";
import { readThemeMode } from "@/lib/theme-cookie";
export const dynamic = "force-dynamic";
export default async function Postings({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireUser()
    .then(async session => {
      // Confirm DB-level school eligibility before mounting Workspace (which reads browser IndexedDB cache).
      await assertDbSchoolUser(session.db);
      return session;
    })
    .catch((e: unknown) => {
      if (e instanceof HttpError) redirect(`/login${e.status === 403 ? "?error=school" : ""}`);
      throw e;
    });
  // Postings are loaded by the browser (stored copy + changes only); the page carries just the student's own data.
  // touch_activity marks today as a visit day for the admin page's daily count; a failure there never blocks the page.
  const [data, admin] = await Promise.all([
    loadPersonal(ctx.db, ctx.user.id),
    ctx.db.from("admins").select("user_id").eq("user_id", ctx.user.id).maybeSingle(),
    Promise.resolve(ctx.db.rpc("touch_activity")).catch(() => null),
  ]);
  return (
    <Workspace
      mode="live"
      postings={null}
      initialFavorites={data.favoriteIds}
      initialApplications={data.applications}
      initialFilters={normalizeFilters(await searchParams)}
      initialNow={new Date().toISOString()}
      initialMajor={isMajor(ctx.user.user_metadata?.major) ? ctx.user.user_metadata.major : null}
      userLabel={ctx.user.email?.split("@")[0] ?? "한양인"}
      isAdmin={Boolean(admin.data)}
      initialTheme={await readThemeMode()}
    />
  );
}
