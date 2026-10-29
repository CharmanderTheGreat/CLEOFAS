import type { Metadata } from "next";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { MIN_AGE } from "@/lib/constants";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-sm space-y-6 py-12 text-center">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Cleofas</h1>
        <p className="text-muted">A safe place to rant. You choose who can see and reply.</p>
      </div>

      <div className="card space-y-4">
        <GoogleSignInButton />
        <p className="text-xs text-muted">
          We only use your Google account to sign you in. Your name and photo are never shown on Cleofas.
        </p>
        <p className="text-xs text-muted">By continuing, you confirm that you are at least {MIN_AGE} years old.</p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error === "profile"
            ? "We couldn't load your profile. Please sign in again."
            : "Sign-in failed. Please try again."}
        </p>
      )}
    </div>
  );
}
