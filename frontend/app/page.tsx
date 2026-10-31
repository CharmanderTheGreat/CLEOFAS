import Link from "next/link";
import { PostList } from "@/components/PostList";
import { requireOnboarded } from "@/lib/auth";
import { fetchPosts } from "@/lib/posts";

export const metadata = { title: "Home" };

export default async function HomePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { supabase } = await requireOnboarded();
  const { tab } = await searchParams;
  const followingOnly = tab === "following";

  // First page in one database call; the rest loads while scrolling (PostList).
  const { posts, hasMore } = await fetchPosts(supabase, { followingOnly });

  const tabClass = (active: boolean) =>
    `rounded-full px-3 py-1 text-sm ${active ? "bg-accent text-on-accent" : "text-muted hover:text-accent"}`;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Link href="/" className={tabClass(!followingOnly)}>Everyone</Link>
        <Link href="/?tab=following" className={tabClass(followingOnly)}>Following</Link>
      </div>

      <PostList
        key={followingOnly ? "following" : "everyone"}
        initialPosts={posts}
        initialHasMore={hasMore}
        followingOnly={followingOnly}
        emptyMessage={
          followingOnly
            ? "Nothing from people you follow yet. Try finding people to follow."
            : "No posts yet. Tap the pencil to share something."
        }
      />
    </div>
  );
}
