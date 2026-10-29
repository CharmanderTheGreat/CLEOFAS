import Link from "next/link";
import { PostCard } from "@/components/PostCard";
import { PostComposer } from "@/components/PostComposer";
import { requireOnboarded } from "@/lib/auth";
import { fetchPosts } from "@/lib/posts";

export const metadata = { title: "Home" };

export default async function HomePage({ searchParams }: { searchParams: Promise<{ tab?: string; before?: string }> }) {
  const { supabase, user } = await requireOnboarded();
  const { tab, before } = await searchParams;
  const followingOnly = tab === "following";

  // One database call: posts the viewer may see + authors + reply counts (see list_posts in 0004).
  const { posts, hasMore } = await fetchPosts(supabase, { followingOnly, before });

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
            <PostCard key={post.id} post={post} viewerId={user.id} replyCount={post.reply_count ?? 0} />
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
