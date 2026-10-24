import Link from "next/link";
import { PostCard } from "@/components/PostCard";
import { PostComposer } from "@/components/PostComposer";
import { requireOnboarded } from "@/lib/auth";
import { FEED_PAGE_SIZE } from "@/lib/constants";
import type { PostRow } from "@/lib/types";

export const metadata = { title: "Home" };

const POST_COLUMNS =
  "id, author_id, body, visibility, created_at, updated_at, author:profiles!posts_author_id_fkey(username, display_name)";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ tab?: string; before?: string }> }) {
  const { supabase, user } = await requireOnboarded();
  const { tab, before } = await searchParams;
  const followingOnly = tab === "following";

  // RLS already limits this to posts the viewer may see (public + visible mutuals).
  let query = supabase
    .from("posts")
    .select(POST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(FEED_PAGE_SIZE + 1);

  if (before) query = query.lt("created_at", before);

  if (followingOnly) {
    const { data: follows } = await supabase.from("follows").select("following_id").eq("follower_id", user.id);
    const ids = [user.id, ...(follows ?? []).map((f) => f.following_id as string)];
    query = query.in("author_id", ids);
  }

  const { data } = await query;
  const rows = (data ?? []) as unknown as PostRow[];
  const hasMore = rows.length > FEED_PAGE_SIZE;
  const posts = rows.slice(0, FEED_PAGE_SIZE);

  const counts = new Map<string, number>();
  if (posts.length > 0) {
    const { data: countRows } = await supabase.rpc("reply_counts", { p_post_ids: posts.map((p) => p.id) });
    for (const row of (countRows ?? []) as { post_id: string; reply_count: number | string }[]) {
      counts.set(row.post_id, Number(row.reply_count));
    }
  }

  const tabClass = (active: boolean) =>
    `rounded-full px-3 py-1 text-sm ${active ? "bg-accent text-white" : "text-muted hover:text-accent"}`;

  const nextHref = (() => {
    const params = new URLSearchParams();
    if (followingOnly) params.set("tab", "following");
    if (posts.length > 0) params.set("before", posts[posts.length - 1].created_at);
    return `/?${params.toString()}`;
  })();

  return (
    <div className="space-y-4">
      <PostComposer />

      <div className="flex gap-2">
        <Link href="/" className={tabClass(!followingOnly)}>Everyone</Link>
        <Link href="/?tab=following" className={tabClass(followingOnly)}>Following</Link>
      </div>

      {posts.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">
          {followingOnly
            ? "Nothing from people you follow yet. Try finding people to follow."
            : "No posts yet. Be the first to share."}
        </p>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} viewerId={user.id} replyCount={counts.get(post.id) ?? 0} />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="text-center">
          <Link href={nextHref} className="btn-ghost">
            Older posts
          </Link>
        </div>
      )}
    </div>
  );
}
