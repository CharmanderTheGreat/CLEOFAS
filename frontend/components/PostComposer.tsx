"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { createPost } from "@/app/actions";
import { MAX_POST_LENGTH } from "@/lib/constants";
import { VisibilityPicker } from "./VisibilityPicker";

export function PostComposer() {
  const [state, action, pending] = useActionState(createPost, undefined);
  const [length, setLength] = useState(0);
  const [anonymous, setAnonymous] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the form after a successful post.
  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setLength(0);
      setAnonymous(false);
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="card space-y-3">
      <label htmlFor="body" className="sr-only">
        What&apos;s on your mind?
      </label>
      <textarea
        id="body"
        name="body"
        rows={4}
        maxLength={MAX_POST_LENGTH}
        required
        placeholder="Let it out. What's on your mind?"
        className="input resize-none"
        onChange={(event) => setLength(event.target.value.length)}
      />
      {anonymous ? (
        <>
          <input type="hidden" name="visibility" value="public" />
          <p className="text-xs text-muted">
            Anonymous posts are public: any signed-in user can see and reply, and nobody can see who wrote it.
            Moderators can still see the author if the post is reported.
          </p>
        </>
      ) : (
        <VisibilityPicker />
      )}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="anonymous"
          checked={anonymous}
          onChange={(event) => setAnonymous(event.target.checked)}
          className="mt-1"
        />
        <span>
          Post anonymously
          <span className="block text-xs text-muted">
            Hidden from everyone, including on your profile. Blocking never reveals it.
          </span>
        </span>
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          Having a hard time?{" "}
          <Link href="/help" className="text-accent underline">
            Find help now
          </Link>
        </p>
        <div className="flex items-center gap-3">
          <span className={`text-xs ${length > MAX_POST_LENGTH - 50 ? "text-accent" : "text-muted"}`}>
            {length}/{MAX_POST_LENGTH}
          </span>
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Posting…" : "Post"}
          </button>
        </div>
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
