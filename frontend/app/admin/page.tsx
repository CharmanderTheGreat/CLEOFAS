import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminReportCard } from "@/components/AdminReportCard";
import { getIsAdmin, requireOnboarded } from "@/lib/auth";
import type { AdminReportRow } from "@/lib/types";

export const metadata: Metadata = { title: "Moderation" };

const STATUSES = ["open", "reviewed", "dismissed"] as const;

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { supabase } = await requireOnboarded();
  // Not an admin: the page does not exist. The database functions check again, so this is only a courtesy.
  if (!(await getIsAdmin())) notFound();

  const { status: raw } = await searchParams;
  const status = (STATUSES as readonly string[]).includes(raw ?? "") ? (raw as (typeof STATUSES)[number]) : "open";

  const { data, error } = await supabase.rpc("admin_list_reports", { p_status: status, p_limit: 50, p_offset: 0 });
  if (error) throw new Error("Could not load reports.");
  const reports = (data ?? []) as AdminReportRow[];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Moderation</h1>
      <p className="text-sm text-muted">
        Reports keep a copy of the text and its real author, even if the content is deleted. Treat the identity of
        anonymous authors as confidential.
      </p>

      <div className="flex gap-2">
        {STATUSES.map((item) => (
          <Link
            key={item}
            href={`/admin?status=${item}`}
            className={`rounded-full px-3 py-1 text-sm capitalize ${
              item === status ? "bg-accent text-on-accent" : "text-muted hover:text-accent"
            }`}
          >
            {item}
          </Link>
        ))}
      </div>

      {reports.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">No {status} reports.</p>
      ) : (
        <ul className="space-y-3">
          {reports.map((report) => (
            <AdminReportCard key={report.id} report={report} />
          ))}
        </ul>
      )}
    </div>
  );
}
