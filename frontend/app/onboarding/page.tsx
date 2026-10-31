import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/ProfileForm";
import { isOnboarded, requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const { profile } = await requireProfile();
  // Already set up (username)? Skip straight to the feed.
  if (isOnboarded(profile)) redirect("/");

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Pick a username</h1>
        <p className="text-sm text-muted">This is how other people will see you. You can change it later in settings (once every 7 days).</p>
      </div>
      <ProfileForm mode="onboarding" profile={profile} />
    </div>
  );
}
