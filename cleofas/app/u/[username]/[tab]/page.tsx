import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboarded } from "@/lib/auth";
import { USERNAME_REGEX } from "@/lib/constants";

export const metadata = { title: "People" };

type Person = { username: string; display_name: string | null };

export default async function FollowListPage({ params }: { params: Promise<{ username: string; tab: string }> }) {
  const { username, tab } = await params;
  if (!USERNAME_REGEX.test(username) || (tab !== "followers" && tab !== "following")) notFound();

  const { supabase, user } = await requireOnboarded();

  const { data: profile } = await supabase.from("profiles").select("id, username").eq("username", username).maybeSingle();
  if (!profile) notFound();
  if (profile.id !== user.id) {
    const { data: blocked } = await supabase.rpc("is_blocked", { a: user.id, b: profile.id });
    if (blocked) notFound();
  }

  // followers: rows where this profile is being followed -> show the follower
  // following: rows where this profile is the follower -> show who they follow
  const isFollowers = tab === "followers";
  const { data } = await supabase
    .from("follows")
    .select(
      isFollowers
        ? "person:profiles!follows_follower_id_fkey(username, display_name)"
        : "person:profiles!follows_following_id_fkey(username, display_name)",
    )
    .eq(isFollowers ? "following_id" : "follower_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const people = ((data ?? []) as unknown as { person: Person | null }[])
    .map((row) => row.person)
    .filter((person): person is Person => person !== null);

  return (
    <div className="space-y-4">
      <Link href={`/u/${profile.username}`} className="link-quiet text-sm">
        ← @{profile.username}
      </Link>
      <h1 className="text-xl font-bold">{isFollowers ? "Followers" : "Following"}</h1>

      {people.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Nobody here yet.</p>
      ) : (
        <ul className="space-y-2">
          {people.map((person) => (
            <li key={person.username}>
              <Link href={`/u/${person.username}`} className="card block hover:border-accent">
                <span className="font-medium">{person.display_name || `@${person.username}`}</span>
                {person.display_name && <span className="ml-2 text-sm text-muted">@{person.username}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
