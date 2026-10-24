"use client";

import { useActionState } from "react";
import { completeOnboarding, updateSettings } from "@/app/actions";
import { MAX_BIO_LENGTH, MAX_DISPLAY_NAME_LENGTH, MIN_AGE } from "@/lib/constants";
import type { Profile } from "@/lib/types";

// One form for both first-time setup (onboarding) and the settings page.
export function ProfileForm({ mode, profile }: { mode: "onboarding" | "settings"; profile: Profile }) {
  const [state, action, pending] = useActionState(mode === "onboarding" ? completeOnboarding : updateSettings, undefined);
  const isOnboarding = mode === "onboarding";

  return (
    <form action={action} className="card space-y-4">
      <div className="space-y-1">
        <label htmlFor="username" className="text-sm font-medium">Username</label>
        <input
          id="username"
          name="username"
          defaultValue={isOnboarding ? "" : profile.username}
          required
          minLength={3}
          maxLength={20}
          pattern="[a-z0-9_]{3,20}"
          autoComplete="off"
          autoCapitalize="none"
          placeholder="e.g. quiet_owl"
          className="input"
        />
        <p className="text-xs text-muted">3-20 characters: lowercase letters, numbers and underscore.</p>
      </div>

      <div className="space-y-1">
        <label htmlFor="displayName" className="text-sm font-medium">Display name (optional)</label>
        <input
          id="displayName"
          name="displayName"
          defaultValue={profile.display_name ?? ""}
          maxLength={MAX_DISPLAY_NAME_LENGTH}
          className="input"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="bio" className="text-sm font-medium">Bio (optional)</label>
        <textarea id="bio" name="bio" defaultValue={profile.bio ?? ""} rows={3} maxLength={MAX_BIO_LENGTH} className="input resize-none" />
      </div>

      {!isOnboarding && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="defaultAnonymous" defaultChecked={profile.default_anonymous_replies} className="mt-1" />
          <span>
            Reply anonymously by default
            <span className="block text-xs text-muted">You can still change it on each reply.</span>
          </span>
        </label>
      )}

      {isOnboarding && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="ageConfirmed" required className="mt-1" />
          <span>I confirm that I am at least {MIN_AGE} years old.</span>
        </label>
      )}

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Saving…" : isOnboarding ? "Continue" : "Save changes"}
      </button>

      {state?.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state?.ok && <p className="text-sm text-muted">{state.message}</p>}
    </form>
  );
}
