import Link from "next/link";
import { Clock, Globe, Lock, MessageCircle, TriangleAlert } from "lucide-react";
import { deletePost } from "@/app/actions";
import { fullDate, timeAgo, timeLeft } from "@/lib/format";
import type { PostRow } from "@/lib/types";
import { ActionForm } from "./ActionForm";
import { Avatar } from "./Avatar";
import { EditPostForm } from "./EditForms";
import { ReactionBar } from "./ReactionBar";
import { ReportDialog } from "./ReportDialog";

type Props = {
  post: PostRow;
  replyCount?: number;
  // On the post page we show the full controls (edit, delete, report).
  detailed?: boolean;
};

export function PostCard({ post, replyCount = 0, detailed = false }: Props) {
  const isMine = post.is_mine;
  const author = post.author;
  const edited = post.updated_at !== post.created_at;

  const body = <p className="whitespace-pre-wrap break-words">{post.body}</p>;

  return (
    <article className="card space-y-3">
      <header className="flex items-center gap-2.5 text-sm">
        {author ? (
          <Link href={`/u/${author.username}`} aria-label={`@${author.username}`}>
            <Avatar username={author.username} path={author.avatar_path} size={36} />
          </Link>
        ) : (
          <Avatar anonymous size={36} />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            {author ? (
              <Link href={`/u/${author.username}`} className="truncate font-semibold hover:text-accent">
                @{author.username}
              </Link>
            ) : (
              <span className="font-semibold">Anonymous{isMine ? " (you)" : ""}</span>
            )}
            <span className="text-muted">·</span>
            <time dateTime={post.created_at} title={fullDate(post.created_at)} className="text-muted" suppressHydrationWarning>
              {timeAgo(post.created_at)}
            </time>
            {edited && <span className="text-xs text-muted">(edited)</span>}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {post.expires_at && (
            <span
              title="Vent mode: this post disappears on its own"
              className="inline-flex items-center gap-1 rounded-full bg-chip px-2 py-0.5 text-xs text-muted"
              suppressHydrationWarning
            >
              <Clock size={12} aria-hidden /> {timeLeft(post.expires_at)}
            </span>
          )}
          <span
            title={post.visibility === "public" ? "Public" : "Mutuals only"}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
              post.visibility === "public" ? "bg-accent-soft text-accent" : "bg-chip text-muted"
            }`}
          >
            {post.visibility === "public" ? <Globe size={12} aria-hidden /> : <Lock size={12} aria-hidden />}
            {post.visibility === "public" ? "Public" : "Mutuals"}
          </span>
        </div>
      </header>

      {post.content_warning ? (
        <details className="group rounded-xl border border-line bg-paper p-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <TriangleAlert size={16} className="shrink-0 text-accent" aria-hidden />
            <span className="min-w-0 break-words">Content warning: {post.content_warning}</span>
            <span className="ml-auto shrink-0 text-xs font-normal text-muted group-open:hidden">Tap to show</span>
          </summary>
          <div className="mt-2">{body}</div>
        </details>
      ) : (
        body
      )}

      <ReactionBar postId={post.id} counts={post.reactions} mine={post.my_reaction} />

      <footer className="flex flex-wrap items-start gap-x-4 gap-y-2 text-sm">
        {!detailed && (
          <Link href={`/post/${post.id}`} className="link-quiet inline-flex items-center gap-1.5">
            <MessageCircle size={16} aria-hidden />
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
