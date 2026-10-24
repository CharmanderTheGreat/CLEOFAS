import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TEMP_USERNAME_REGEX } from "@/lib/constants";
import type { Profile } from "@/lib/types";

// Signed-in user + their profile, or a redirect to /login.
export const requireProfile = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/login?error=profile");

  return { supabase, user, profile: profile as Profile };
});

// Same, but also forces people with a temporary username through /onboarding first.
export async function requireOnboarded() {
  const ctx = await requireProfile();
  if (TEMP_USERNAME_REGEX.test(ctx.profile.username)) redirect("/onboarding");
  return ctx;
}
