import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TEMP_USERNAME_REGEX } from "@/lib/constants";
import type { Viewer } from "@/lib/types";

// One Supabase client + one identity check per request, shared by the layout, the page and helpers.
// getClaims() verifies the JWT signature locally, so reads do not need a round trip to the Auth server.
// (Server Actions that change data use getUser() instead, see app/actions.ts.)
const getSupabase = cache(async () => createClient());

const getUserId = cache(async () => {
  const supabase = await getSupabase();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return typeof sub === "string" ? sub : null;
});

// Signed-in user's profile + private settings in ONE query, or null when signed out.
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const id = await getUserId();
  if (!id) return null;

  const supabase = await getSupabase();
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, bio, created_at, private:profile_private(default_anonymous_replies)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  const { private: priv, ...profile } = data as unknown as Omit<Viewer, "default_anonymous_replies"> & {
    private: { default_anonymous_replies: boolean } | null;
  };
  return {
    ...profile,
    default_anonymous_replies: priv?.default_anonymous_replies ?? false,
  };
});

export function isOnboarded(viewer: Viewer): boolean {
  return !TEMP_USERNAME_REGEX.test(viewer.username);
}

// Signed-in user + their profile, or a redirect to /login.
export async function requireProfile() {
  const id = await getUserId();
  if (!id) redirect("/login");
  const profile = await getViewer();
  if (!profile) redirect("/login?error=profile");
  return { supabase: await getSupabase(), user: { id }, profile };
}

// Same, but also forces people who have not finished onboarding (username) through /onboarding.
export async function requireOnboarded() {
  const ctx = await requireProfile();
  if (!isOnboarded(ctx.profile)) redirect("/onboarding");
  return ctx;
}
