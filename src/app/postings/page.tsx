import { redirect } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { requireUser, HttpError } from "@/lib/auth";
import { loadPersonal } from "@/lib/data";
import type { Filters } from "@/lib/domain";
import { isMajor } from "@/lib/majors";
import { readThemeMode } from "@/lib/theme-cookie";
export const dynamic = "force-dynamic";
export default async function Postings({ searchParams }: { searchParams: Promise<Filters> }) {
  const ctx = await requireUser().catch((e: unknown) => {
    if (e instanceof HttpError) redirect(`/login${e.status === 403 ? "?error=school" : ""}`);
    throw e;
  });
  // Postings are loaded by the browser (stored copy + changes only); the page carries just the student's own data.
  const [data, admin] = await Promise.all([
    loadPersonal(ctx.db, ctx.user.id),
    ctx.db.from("admins").select("user_id").eq("user_id", ctx.user.id).maybeSingle(),
  ]);
  return (
    <Workspace
      mode="live"
      postings={null}
      initialFavorites={data.favoriteIds}
      initialApplications={data.applications}
      initialFilters={await searchParams}
      initialNow={new Date().toISOString()}
      initialMajor={isMajor(ctx.user.user_metadata?.major) ? ctx.user.user_metadata.major : null}
      userLabel={ctx.user.email?.split("@")[0] ?? "한양인"}
      isAdmin={Boolean(admin.data)}
      initialTheme={await readThemeMode()}
    />
  );
}
