import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/ProfileForm";
import { requireProfile } from "@/lib/auth";
import { TEMP_USERNAME_REGEX } from "@/lib/constants";

export const metadata: Metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const { profile } = await requireProfile();
  // Already set up? Skip straight to the feed.
  if (!TEMP_USERNAME_REGEX.test(profile.username)) redirect("/");

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Pick a username</h1>
        <p className="text-sm text-muted">This is how other people will see you. You can change it later in settings.</p>
      </div>
      <ProfileForm mode="onboarding" profile={profile} />
    </div>
  );
}
