import Link from "next/link";
import { adminRemoveTarget, adminSetReportStatus } from "@/app/actions";
import { fullDate } from "@/lib/format";
import type { AdminReportRow } from "@/lib/types";
import { ActionForm } from "./ActionForm";

export function AdminReportCard({ report }: { report: AdminReportRow }) {
  return (
    <li className="card space-y-3">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="rounded-full bg-chip px-2 py-0.5 text-xs text-muted">{report.target_kind}</span>
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">{report.status}</span>
        <time dateTime={report.created_at} className="text-muted" suppressHydrationWarning>
          {fullDate(report.created_at)}
        </time>
        <span className="text-muted">· reported by @{report.reporter_username ?? "deleted user"}</span>
      </header>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Reason</p>
        <p className="whitespace-pre-wrap break-words text-sm">{report.reason}</p>
      </div>

      <div className="rounded-xl border border-line bg-paper p-3">
        <p className="mb-1 text-xs text-muted">
          Written by{" "}
          {report.target_username ? (
            <Link href={`/u/${report.target_username}`} className="font-medium text-accent underline">
              @{report.target_username}
            </Link>
          ) : (
            "a deleted user"
          )}
          {report.target_is_anonymous ? " (posted anonymously, only moderators can see this)" : ""}
          {!report.target_exists ? " · already removed" : ""}
        </p>
        <p className="whitespace-pre-wrap break-words text-sm">{report.target_body}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {report.target_exists && (
          <ActionForm
            action={adminRemoveTarget}
            fields={{ id: report.id }}
            className="btn-danger"
            pendingLabel="Removing…"
            confirm="Remove this content? This can't be undone."
          >
            Remove content
          </ActionForm>
        )}
        {report.status !== "reviewed" && (
          <ActionForm action={adminSetReportStatus} fields={{ id: report.id, status: "reviewed" }} className="btn-primary">
            Mark reviewed
          </ActionForm>
        )}
        {report.status !== "dismissed" && (
          <ActionForm action={adminSetReportStatus} fields={{ id: report.id, status: "dismissed" }} className="btn-ghost">
            Dismiss
          </ActionForm>
        )}
        {report.status !== "open" && (
          <ActionForm action={adminSetReportStatus} fields={{ id: report.id, status: "open" }} className="btn-ghost">
            Reopen
          </ActionForm>
        )}
      </div>
    </li>
  );
}
