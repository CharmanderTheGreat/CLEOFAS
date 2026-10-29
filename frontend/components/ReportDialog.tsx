"use client";

import { useActionState } from "react";
import { reportContent } from "@/app/actions";
import { MAX_REPORT_REASON_LENGTH } from "@/lib/constants";

// Inline "Report" disclosure for a post or a reply.
export function ReportDialog({ postId, replyId }: { postId?: string; replyId?: string }) {
  const [state, action, pending] = useActionState(reportContent, undefined);

  return (
    <details className="text-sm">
      <summary className="link-quiet cursor-pointer">Report</summary>
      {state?.ok ? (
        <p className="mt-2 text-muted">{state.message}</p>
      ) : (
        <form action={action} className="mt-2 space-y-2">
          {postId && <input type="hidden" name="postId" value={postId} />}
          {replyId && <input type="hidden" name="replyId" value={replyId} />}
          <label className="block text-xs text-muted" htmlFor={`reason-${postId ?? replyId}`}>
            What&apos;s wrong with this {replyId ? "reply" : "post"}?
          </label>
          <textarea
            id={`reason-${postId ?? replyId}`}
            name="reason"
            rows={2}
            maxLength={MAX_REPORT_REASON_LENGTH}
            required
            className="input resize-none"
            placeholder="Harassment, spam, self-harm risk…"
          />
          <button type="submit" className="btn-danger" disabled={pending}>
            {pending ? "Sending…" : "Send report"}
          </button>
          {state?.error && <p role="alert" className="text-red-700">{state.error}</p>}
        </form>
      )}
    </details>
  );
}
