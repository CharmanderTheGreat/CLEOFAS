import { notFound } from "next/navigation";
import Link from "next/link";
import { PostCard } from "@/components/PostCard";
import { LiveRefresh } from "@/components/LiveRefresh";
import { ReplyForm } from "@/components/ReplyForm";
import { ReplyList } from "@/components/ReplyList";
import { requireOnboarded } from "@/lib/auth";
import { UUID_REGEX } from "@/lib/constants";
import { toPostRow } from "@/lib/posts";
import type { ReplyRow } from "@/lib/types";

export const metadata = { title: "Post" };

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();

  const { supabase, profile } = await requireOnboarded();

  // Post and replies are independent, so fetch them in parallel. Both go through database functions:
  // get_post() hides the author of anonymous posts, get_replies() hides anonymous repliers.
  // No post comes back when it is hidden from this viewer (mutuals-only, blocked, ...).
  const [postRes, replyRes] = await Promise.all([
    supabase.rpc("get_post", { p_post_id: id }),
    supabase.rpc("get_replies", { p_post_id: id }),
  ]);
  if (postRes.error || replyRes.error) throw new Error("Could not load this post.");
  const row = ((postRes.data ?? []) as Parameters<typeof toPostRow>[0][])[0];
  if (!row) notFound();
  const post = toPostRow(row);
  const replies = (replyRes.data ?? []) as ReplyRow[];

  return (
    <div className="space-y-4">
      <Link href="/" className="link-quiet text-sm">
        ← Back
      </Link>

      <LiveRefresh topic={`post:${post.id}`} event="reply" />
      <PostCard post={post} detailed />

      <section aria-label="Replies" className="space-y-3">
        <h2 className="text-sm font-semibold text-muted">
          {replies.length} {replies.length === 1 ? "reply" : "replies"}
        </h2>
        <ReplyList replies={replies} postId={post.id} />
      </section>

      <ReplyForm
        postId={post.id}
        defaultAnonymous={profile.default_anonymous_replies}
        visibility={post.visibility}
      />
    </div>
  );
}
