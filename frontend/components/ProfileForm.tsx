"use client";

import { useActionState } from "react";
import { completeOnboarding, updateSettings } from "@/app/actions";
import { cooldownEnds, formatCooldown } from "@/lib/avatar";
import { COOLDOWN_DAYS, MAX_BIO_LENGTH, TEMP_USERNAME_REGEX, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from "@/lib/constants";
import type { Viewer } from "@/lib/types";

// One form for both first-time setup (onboarding) and the settings page.
export function ProfileForm({ mode, profile }: { mode: "onboarding" | "settings"; profile: Viewer }) {
  const [state, action, pending] = useActionState(mode === "onboarding" ? completeOnboarding : updateSettings, undefined);
  const isOnboarding = mode === "onboarding";

  // The username can be changed once every 7 days (the first pick is free).
  const lockedUntil = isOnboarding ? null : cooldownEnds(profile.username_changed_at);

  return (
    <form action={action} className="card space-y-4">
      <div className="space-y-1">
        <label htmlFor="username" className="text-sm font-medium">
          Username
        </label>
        <input
          id="username"
          name="username"
          defaultValue={TEMP_USERNAME_REGEX.test(profile.username) ? "" : profile.username}
          required
          minLength={USERNAME_MIN_LENGTH}
          maxLength={USERNAME_MAX_LENGTH}
          readOnly={lockedUntil !== null}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="e.g. quiet.owl"
          className={`input ${lockedUntil ? "cursor-not-allowed opacity-60" : ""}`}
        />
        {lockedUntil ? (
          <p className="text-xs text-muted">You can change your username again on {formatCooldown(lockedUntil)}.</p>
        ) : (
          <p className="text-xs text-muted">
            {USERNAME_MIN_LENGTH}-{USERNAME_MAX_LENGTH} characters: letters, numbers and _ . - (start and end with a letter or
            number). {isOnboarding ? "" : `You can change it once every ${COOLDOWN_DAYS} days.`}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor="bio" className="text-sm font-medium">
          Bio (optional)
        </label>
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

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Saving…" : isOnboarding ? "Continue" : "Save changes"}
      </button>

      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      {state?.ok && <p className="text-sm text-muted">{state.message}</p>}
    </form>
  );
}
