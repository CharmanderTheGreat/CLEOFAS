import type { Metadata } from "next";
import Link from "next/link";
import { BlockButton } from "@/components/BlockButton";
import { DeleteAccountForm } from "@/components/DeleteAccountForm";
import { signOut } from "@/app/actions";
import { AvatarUploader } from "@/components/AvatarUploader";
import { MutedWordsForm } from "@/components/MutedWordsForm";
import { ProfileForm } from "@/components/ProfileForm";
import { getIsAdmin, requireOnboarded } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase, user, profile } = await requireOnboarded();

  // Only your own blocks are readable (RLS), so this list is private.
  const { data, error } = await supabase
    .from("blocks")
    .select("blocked_id, blocked:profiles!blocks_blocked_id_fkey(username)")
    .eq("blocker_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error("Could not load settings.");

  const isAdmin = await getIsAdmin();

  const blocked = ((data ?? []) as unknown as { blocked_id: string; blocked: { username: string } | null }[]).filter(
    (row) => row.blocked,
  );

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-xl font-bold">Settings</h1>
        <AvatarUploader username={profile.username} avatarPath={profile.avatar_path} changedAt={profile.avatar_changed_at} />
        <ProfileForm mode="settings" profile={profile} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Filters</h2>
        <MutedWordsForm words={profile.muted_words} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Blocked users</h2>
        {blocked.length === 0 ? (
          <p className="text-sm text-muted">You haven&apos;t blocked anyone.</p>
        ) : (
          <ul className="space-y-2">
            {blocked.map((row) => (
              <li key={row.blocked_id} className="card flex items-center justify-between">
                <span>@{row.blocked!.username}</span>
                <BlockButton userId={row.blocked_id} username={row.blocked!.username} isBlocked />
              </li>
            ))}
          </ul>
        )}
      </section>

      {isAdmin && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Moderator tools</h2>
          <Link href="/admin" className="btn-ghost">
            Open moderation page
          </Link>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Account</h2>
        <form action={signOut}>
          <button type="submit" className="btn-ghost">
            Sign out
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Danger zone</h2>
        <DeleteAccountForm />
      </section>

      <p className="text-sm text-muted">
        Need to talk to someone?{" "}
        <Link href="/help" className="text-accent underline">
          Crisis resources
        </Link>
      </p>
    </div>
  );
}
