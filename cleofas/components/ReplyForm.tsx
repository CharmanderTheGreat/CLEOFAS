"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createReply } from "@/app/actions";
import { MAX_REPLY_LENGTH } from "@/lib/constants";

export function ReplyForm({ postId, defaultAnonymous }: { postId: string; defaultAnonymous: boolean }) {
  const [state, action, pending] = useActionState(createReply, undefined);
  const [length, setLength] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setLength(0);
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="card space-y-3">
      <input type="hidden" name="postId" value={postId} />
      <label htmlFor="reply-body" className="sr-only">
        Write a reply
      </label>
      <textarea
        id="reply-body"
        name="body"
        rows={3}
        maxLength={MAX_REPLY_LENGTH}
        required
        placeholder="Write a kind reply…"
        className="input resize-none"
        onChange={(event) => setLength(event.target.value.length)}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="anonymous" defaultChecked={defaultAnonymous} />
          Reply anonymously
        </label>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">
            {length}/{MAX_REPLY_LENGTH}
          </span>
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Sending…" : "Reply"}
          </button>
        </div>
      </div>
      <p className="text-xs text-muted">
        Anonymous replies hide your username from everyone, including the post author. Moderators can still see who
        wrote them.
      </p>
      {state?.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
