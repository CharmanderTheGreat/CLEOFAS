import { createBrowserClient } from "@supabase/ssr";

// Browser client (only used for the Google sign-in button).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
