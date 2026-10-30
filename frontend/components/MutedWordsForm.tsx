"use client";

import { useActionState } from "react";
import { updateMutedWords } from "@/app/actions";
import { MAX_MUTED_WORDS } from "@/lib/constants";

export function MutedWordsForm({ words }: { words: string[] }) {
  const [state, action, pending] = useActionState(updateMutedWords, undefined);

  return (
    <form action={action} className="card space-y-3">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Muted words</span>
        <textarea
          name="words"
          rows={3}
          defaultValue={words.join(", ")}
          placeholder="spoiler, exam, ex"
          className="input resize-none"
        />
      </label>
      <p className="text-xs text-muted">
        Separate words with commas (up to {MAX_MUTED_WORDS}). Posts and other people&apos;s replies that contain a muted
        word are hidden from you. Whole words only, not case sensitive. Your own posts are never hidden.
      </p>
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save muted words"}
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
