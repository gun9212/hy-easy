import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { samplePostings, DEMO_NOW } from "@/lib/sample";
import { demoEnabled } from "@/lib/supabase/server";
import { normalizeFilters } from "@/lib/domain";
import { readThemeMode } from "@/lib/theme-cookie";
import { isPhoneRequest } from "@/lib/device";
export const dynamic = "force-dynamic";
export default async function Demo({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!demoEnabled()) notFound();
  return (
    <Workspace
      mode="demo"
      postings={samplePostings}
      initialFavorites={[]}
      initialApplications={[]}
      initialFilters={normalizeFilters(await searchParams)}
      initialNow={DEMO_NOW}
      initialMajor={null}
      userLabel="둘러보는 한양인"
      isAdmin={false}
      initialTheme={await readThemeMode()}
      initialNarrow={await isPhoneRequest()}
    />
  );
}
