import Link from "next/link";
import { deleteReply } from "@/app/actions";
import { fullDate, timeAgo } from "@/lib/format";
import type { ReplyRow } from "@/lib/types";
import { ActionForm } from "./ActionForm";
import { Avatar } from "./Avatar";
import { EditReplyForm } from "./EditForms";
import { ReportDialog } from "./ReportDialog";

export function ReplyList({ replies, postId }: { replies: ReplyRow[]; postId: string }) {
  if (replies.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">No replies yet. Be the first to be kind.</p>;
  }

  return (
    <ul className="space-y-3">
      {replies.map((reply) => (
        <li key={reply.id} className="card space-y-2">
          <header className="flex flex-wrap items-center gap-x-2 text-sm">
            {reply.is_anonymous || !reply.username ? (
              <>
                <Avatar anonymous size={28} />
                <span className="font-semibold">Anonymous{reply.is_mine ? " (you)" : ""}</span>
              </>
            ) : (
              <>
                <Link href={`/u/${reply.username}`} aria-label={`@${reply.username}`}>
                  <Avatar username={reply.username} path={reply.avatar_path} size={28} />
                </Link>
                <Link href={`/u/${reply.username}`} className="font-semibold hover:text-accent">
                  @{reply.username}
                </Link>
              </>
            )}
            <span className="text-muted">·</span>
            <time dateTime={reply.created_at} title={fullDate(reply.created_at)} className="text-muted">
              {timeAgo(reply.created_at)}
            </time>
          </header>

          <p className="whitespace-pre-wrap break-words">{reply.body}</p>

          <footer className="flex flex-wrap items-start gap-x-4 gap-y-2 text-sm">
            {reply.is_mine && <EditReplyForm id={reply.id} postId={postId} body={reply.body} />}
            {reply.can_delete && (
              <ActionForm
                action={deleteReply}
                fields={{ id: reply.id, postId }}
                className="link-quiet"
                pendingLabel="Deleting…"
                confirm="Delete this reply?"
              >
                Delete
              </ActionForm>
            )}
            {!reply.is_mine && <ReportDialog replyId={reply.id} />}
          </footer>
        </li>
      ))}
    </ul>
  );
}
