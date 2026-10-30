"use client";

import { useActionState } from "react";
import { updatePost, updateReply } from "@/app/actions";
import { MAX_POST_LENGTH, MAX_REPLY_LENGTH, type Visibility } from "@/lib/constants";
import { VisibilityPicker } from "./VisibilityPicker";

export function EditPostForm({
  id,
  body,
  visibility,
  isAnonymous = false,
}: {
  id: string;
  body: string;
  visibility: Visibility;
  isAnonymous?: boolean;
}) {
  const [state, action, pending] = useActionState(updatePost, undefined);

  return (
    <details className="text-sm">
      <summary className="link-quiet cursor-pointer">Edit</summary>
      <form action={action} className="mt-2 space-y-2">
        <input type="hidden" name="id" value={id} />
        <textarea name="body" defaultValue={body} rows={4} maxLength={MAX_POST_LENGTH} required className="input resize-none" />
        {isAnonymous ? (
          <>
            <input type="hidden" name="visibility" value="public" />
            <p className="text-xs text-muted">Anonymous posts are always public.</p>
          </>
        ) : (
          <VisibilityPicker defaultValue={visibility} />
        )}
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        {state?.error && <p role="alert" className="text-danger">{state.error}</p>}
        {state?.ok && <p className="text-muted">{state.message}</p>}
      </form>
    </details>
  );
}

export function EditReplyForm({ id, postId, body }: { id: string; postId: string; body: string }) {
  const [state, action, pending] = useActionState(updateReply, undefined);

  return (
    <details className="text-sm">
      <summary className="link-quiet cursor-pointer">Edit</summary>
      <form action={action} className="mt-2 space-y-2">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="postId" value={postId} />
        <textarea name="body" defaultValue={body} rows={3} maxLength={MAX_REPLY_LENGTH} required className="input resize-none" />
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        {state?.error && <p role="alert" className="text-danger">{state.error}</p>}
        {state?.ok && <p className="text-muted">{state.message}</p>}
      </form>
    </details>
  );
}
