import Link from "next/link";
import { notFound } from "next/navigation";
import { BlockButton } from "@/components/BlockButton";
import { FollowButton } from "@/components/FollowButton";
import { PostCard } from "@/components/PostCard";
import { requireOnboarded } from "@/lib/auth";
import { FEED_PAGE_SIZE, USERNAME_REGEX } from "@/lib/constants";
import type { PostRow, Profile } from "@/lib/types";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return { title: `@${username}` };
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ before?: string }>;
}) {
  const { username } = await params;
  const { before } = await searchParams;
  if (!USERNAME_REGEX.test(username)) notFound();

  const { supabase, user } = await requireOnboarded();

  const { data: found } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
  if (!found) notFound();
  const profile = found as Profile;
  const isMe = profile.id === user.id;

  // Blocked in either direction: the two people are hidden from each other.
  if (!isMe) {
    const { data: blocked } = await supabase.rpc("is_blocked", { a: user.id, b: profile.id });
    if (blocked) notFound();
  }

  const [followersRes, followingRes, iFollowRes, followsMeRes] = await Promise.all([
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", profile.id),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", profile.id),
    supabase.from("follows").select("follower_id").eq("follower_id", user.id).eq("following_id", profile.id).maybeSingle(),
    supabase.from("follows").select("follower_id").eq("follower_id", profile.id).eq("following_id", user.id).maybeSingle(),
  ]);
  const iFollow = Boolean(iFollowRes.data);
  const followsMe = Boolean(followsMeRes.data);

  // RLS hides mutuals-only posts unless the viewer is a mutual (or the author).
  let query = supabase
    .from("posts")
    .select(
      "id, author_id, body, visibility, created_at, updated_at, author:profiles!posts_author_id_fkey(username, display_name)",
    )
    .eq("author_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(FEED_PAGE_SIZE + 1);
  if (before) query = query.lt("created_at", before);

  const { data: postData } = await query;
  const rows = (postData ?? []) as unknown as PostRow[];
  const hasMore = rows.length > FEED_PAGE_SIZE;
  const posts = rows.slice(0, FEED_PAGE_SIZE);

  const counts = new Map<string, number>();
  if (posts.length > 0) {
    const { data: countRows } = await supabase.rpc("reply_counts", { p_post_ids: posts.map((p) => p.id) });
    for (const row of (countRows ?? []) as { post_id: string; reply_count: number | string }[]) {
      counts.set(row.post_id, Number(row.reply_count));
    }
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{profile.display_name || `@${profile.username}`}</h1>
            {profile.display_name && <p className="text-sm text-muted">@{profile.username}</p>}
          </div>
          <div className="flex items-center gap-2">
            {isMe ? (
              <Link href="/settings" className="btn-ghost">
                Edit profile
              </Link>
            ) : (
              <>
                {iFollow && followsMe && (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">Mutual</span>
                )}
                {!iFollow && followsMe && <span className="text-xs text-muted">Follows you</span>}
                <FollowButton userId={profile.id} isFollowing={iFollow} />
                <BlockButton userId={profile.id} username={profile.username} isBlocked={false} />
              </>
            )}
          </div>
        </div>

        {profile.bio && <p className="whitespace-pre-wrap break-words text-sm">{profile.bio}</p>}

        <div className="flex gap-4 text-sm">
          <Link href={`/u/${profile.username}/followers`} className="link-quiet">
            <strong className="text-ink">{followersRes.count ?? 0}</strong> followers
          </Link>
          <Link href={`/u/${profile.username}/following`} className="link-quiet">
            <strong className="text-ink">{followingRes.count ?? 0}</strong> following
          </Link>
        </div>
      </section>

      {posts.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No posts you can see yet.</p>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} viewerId={user.id} replyCount={counts.get(post.id) ?? 0} />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="text-center">
          <Link href={`/u/${profile.username}?before=${encodeURIComponent(posts[posts.length - 1].created_at)}`} className="btn-ghost">
            Older posts
          </Link>
        </div>
      )}
    </div>
  );
}
