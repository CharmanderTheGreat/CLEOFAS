"use client";

import { useActionState } from "react";
import { deleteAccount } from "@/app/actions";

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState(deleteAccount, undefined);

  return (
    <details className="card space-y-3 text-sm">
      <summary className="cursor-pointer font-medium text-red-700">Delete my account</summary>
      <form action={action} className="mt-3 space-y-3">
        <p className="text-muted">
          This permanently deletes your profile, posts, replies, follows and blocks. It can&apos;t be undone. Reports you
          sent stay with the moderators.
        </p>
        <label className="block space-y-1">
          <span className="text-xs text-muted">Type &quot;delete&quot; to confirm</span>
          <input name="confirm" autoComplete="off" required className="input" />
        </label>
        <button type="submit" className="btn-danger" disabled={pending}>
          {pending ? "Deleting…" : "Delete everything"}
        </button>
        {state?.error && (
          <p role="alert" className="text-red-700">
            {state.error}
          </p>
        )}
      </form>
    </details>
  );
}
