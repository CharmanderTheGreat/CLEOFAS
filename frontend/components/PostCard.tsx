import Link from "next/link";
import { deletePost } from "@/app/actions";
import { ActionForm } from "./ActionForm";
import { fullDate, timeAgo } from "@/lib/format";
import type { PostRow } from "@/lib/types";
import { EditPostForm } from "./EditForms";
import { ReportDialog } from "./ReportDialog";

type Props = {
  post: PostRow;
  viewerId?: string;
  replyCount?: number;
  // On the post page we show the full controls (edit, delete, report).
  detailed?: boolean;
};

export function PostCard({ post, viewerId, replyCount = 0, detailed = false }: Props) {
  const isMine = post.is_mine;
  const author = post.author;
  const edited = post.updated_at !== post.created_at;

  return (
    <article className="card space-y-2">
      <header className="flex flex-wrap items-center gap-x-2 text-sm">
        {author ? (
          <Link href={`/u/${author.username}`} className="font-semibold hover:text-accent">
            {author.display_name || `@${author.username}`}
          </Link>
        ) : (
          <span className="font-semibold">Anonymous{isMine ? " (you)" : ""}</span>
        )}
        {author?.display_name && <span className="text-muted">@{author.username}</span>}
        <span className="text-muted">·</span>
        <time dateTime={post.created_at} title={fullDate(post.created_at)} className="text-muted" suppressHydrationWarning>
          {timeAgo(post.created_at)}
        </time>
        {edited && <span className="text-xs text-muted">(edited)</span>}
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-xs ${
            post.visibility === "public" ? "bg-accent-soft text-accent" : "bg-chip text-muted"
          }`}
        >
          {post.visibility === "public" ? "Public" : "Mutuals"}
        </span>
      </header>

      <p className="whitespace-pre-wrap break-words">{post.body}</p>

      <footer className="flex flex-wrap items-start gap-x-4 gap-y-2 text-sm">
        {!detailed && (
          <Link href={`/post/${post.id}`} className="link-quiet">
            {replyCount === 0 ? "Reply" : `${replyCount} ${replyCount === 1 ? "reply" : "replies"}`}
          </Link>
        )}
        {detailed && isMine && (
          <>
            <EditPostForm id={post.id} body={post.body} visibility={post.visibility} isAnonymous={post.is_anonymous} />
            <ActionForm
              action={deletePost}
              fields={{ id: post.id }}
              className="link-quiet"
              pendingLabel="Deleting…"
              confirm="Delete this post and all its replies?"
            >
              Delete
            </ActionForm>
          </>
        )}
        {detailed && !isMine && <ReportDialog postId={post.id} />}
      </footer>
    </article>
  );
}
