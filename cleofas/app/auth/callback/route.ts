import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Google redirects back here with a one-time code that we swap for a session.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Only allow same-site relative redirects (blocks "//evil.com" style open redirects).
  const next = searchParams.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
