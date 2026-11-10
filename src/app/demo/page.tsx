import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { samplePostings, DEMO_NOW } from "@/lib/sample";
import { demoEnabled } from "@/lib/supabase/server";
import type { Filters } from "@/lib/domain";
export const dynamic = "force-dynamic";
export default async function Demo({ searchParams }: { searchParams: Promise<Filters> }) {
  if (!demoEnabled()) notFound();
  return <Workspace mode="demo" postings={samplePostings} initialFavorites={[]} initialApplications={[]} initialFilters={await searchParams} initialNow={DEMO_NOW} userLabel="둘러보는 한양인" isAdmin={false}/>;
}
