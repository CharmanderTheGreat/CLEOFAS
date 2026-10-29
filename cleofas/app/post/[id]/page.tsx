import { notFound } from "next/navigation";
import Link from "next/link";
import { PostCard } from "@/components/PostCard";
import { ReplyForm } from "@/components/ReplyForm";
import { ReplyList } from "@/components/ReplyList";
import { requireOnboarded } from "@/lib/auth";
import { UUID_REGEX } from "@/lib/constants";
import type { PostRow, ReplyRow } from "@/lib/types";

export const metadata = { title: "Post" };

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();

  const { supabase, user, profile } = await requireOnboarded();

  // Post and replies are independent, so fetch them in parallel.
  // RLS returns no post when it is hidden from this viewer (mutuals-only, blocked, age not confirmed...).
  // Replies only come from get_replies() so anonymous replies never leak the author.
  const [postRes, replyRes] = await Promise.all([
    supabase
      .from("posts")
      .select(
        "id, author_id, body, visibility, created_at, updated_at, author:profiles!posts_author_id_fkey(username, display_name)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.rpc("get_replies", { p_post_id: id }),
  ]);
  if (postRes.error || replyRes.error) throw new Error("Could not load this post.");
  if (!postRes.data) notFound();
  const post = postRes.data as unknown as PostRow;
  const replies = (replyRes.data ?? []) as ReplyRow[];

  return (
    <div className="space-y-4">
      <Link href="/" className="link-quiet text-sm">
        ← Back
      </Link>

      <PostCard post={post} viewerId={user.id} detailed />

      <section aria-label="Replies" className="space-y-3">
        <h2 className="text-sm font-semibold text-muted">
          {replies.length} {replies.length === 1 ? "reply" : "replies"}
        </h2>
        <ReplyList replies={replies} postId={post.id} />
      </section>

      <ReplyForm postId={post.id} defaultAnonymous={profile.default_anonymous_replies} visibility={post.visibility} />
    </div>
  );
}
