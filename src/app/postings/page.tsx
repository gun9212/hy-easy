import { redirect } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { requireUser, HttpError } from "@/lib/auth";
import { loadWorkspace } from "@/lib/data";
import type { Filters } from "@/lib/domain";
export const dynamic = "force-dynamic";
export default async function Postings({ searchParams }: { searchParams: Promise<Filters> }) {
  const ctx = await requireUser().catch((e: unknown) => {
    if (e instanceof HttpError) redirect(`/login${e.status === 403 ? "?error=school" : ""}`);
    throw e;
  });
  const [data, admin] = await Promise.all([
    loadWorkspace(ctx.db, ctx.user.id),
    ctx.db.from("admins").select("user_id").eq("user_id", ctx.user.id).maybeSingle(),
  ]);
  return (
    <Workspace
      mode="live"
      {...data}
      initialFavorites={data.favoriteIds}
      initialApplications={data.applications}
      initialFilters={await searchParams}
      initialNow={new Date().toISOString()}
      userLabel={ctx.user.email?.split("@")[0] ?? "한양인"}
      isAdmin={Boolean(admin.data)}
    />
  );
}
