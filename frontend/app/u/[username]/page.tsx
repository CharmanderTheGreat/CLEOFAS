import Link from "next/link";
import { notFound } from "next/navigation";
import { BlockButton } from "@/components/BlockButton";
import { FollowButton } from "@/components/FollowButton";
import { PostList } from "@/components/PostList";
import { requireOnboarded } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { USERNAME_LOOKUP_REGEX } from "@/lib/constants";
import { fetchPosts } from "@/lib/posts";
import type { Profile } from "@/lib/types";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return { title: `@${username}` };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  if (!USERNAME_LOOKUP_REGEX.test(username)) notFound();

  const { supabase, user } = await requireOnboarded();

  const { data: found } = await supabase
    .from("profiles")
    .select("id, username, bio, avatar_path, created_at")
    .eq("username", username)
    .maybeSingle();
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

  // Mutuals-only posts are hidden unless the viewer is a mutual (or the author). Anonymous posts never show
  // here (except to their own author). One call incl. reply counts; the rest loads while scrolling.
  const { posts, hasMore } = await fetchPosts(supabase, { authorId: profile.id });

  return (
    <div className="space-y-6">
      <section className="card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar username={profile.username} path={profile.avatar_path} size={64} />
            <h1 className="break-all text-xl font-bold">@{profile.username}</h1>
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

      <PostList
        key={profile.id}
        initialPosts={posts}
        initialHasMore={hasMore}
        authorId={profile.id}
        emptyMessage="No posts you can see yet."
      />
    </div>
  );
}
