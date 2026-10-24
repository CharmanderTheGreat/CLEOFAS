import { notFound } from "next/navigation";
import Link from "next/link";
import { PostCard } from "@/components/PostCard";
import { ReplyForm } from "@/components/ReplyForm";
import { ReplyList } from "@/components/ReplyList";
import { requireOnboarded } from "@/lib/auth";
import type { PostRow, ReplyRow } from "@/lib/types";

export const metadata = { title: "Post" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const { supabase, user, profile } = await requireOnboarded();

  // RLS returns nothing when the post is hidden from this viewer (mutuals-only, blocked, ...).
  const { data } = await supabase
    .from("posts")
    .select(
      "id, author_id, body, visibility, created_at, updated_at, author:profiles!posts_author_id_fkey(username, display_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const post = data as unknown as PostRow;

  // Replies only come from get_replies() so anonymous replies never leak the author.
  const { data: replyData } = await supabase.rpc("get_replies", { p_post_id: id });
  const replies = (replyData ?? []) as ReplyRow[];

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

      <ReplyForm postId={post.id} defaultAnonymous={profile.default_anonymous_replies} />
    </div>
  );
}
