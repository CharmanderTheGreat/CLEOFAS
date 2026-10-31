"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Clock, TriangleAlert, VenetianMask } from "lucide-react";
import { createPost } from "@/app/actions";
import { MAX_CONTENT_WARNING_LENGTH, MAX_POST_LENGTH, VENT_OPTIONS } from "@/lib/constants";
import { VisibilityPicker } from "./VisibilityPicker";

export function PostComposer({ onPosted }: { onPosted?: () => void }) {
  const [state, action, pending] = useActionState(createPost, undefined);
  const [length, setLength] = useState(0);
  const [anonymous, setAnonymous] = useState(false);
  const [warning, setWarning] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the form after a successful post, then let the parent (the pop-up) react.
  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setLength(0);
      setAnonymous(false);
      setWarning(false);
      onPosted?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <label htmlFor="body" className="sr-only">
        What&apos;s on your mind?
      </label>
      <textarea
        id="body"
        name="body"
        rows={5}
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
            Anonymous posts are public: any signed-in user can see and reply, and nobody can see who wrote it. Moderators
            can still see the author if the post is reported.
          </p>
        </>
      ) : (
        <VisibilityPicker />
      )}

      <div className="space-y-2 rounded-xl border border-line bg-card p-3 text-sm">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            name="anonymous"
            checked={anonymous}
            onChange={(event) => setAnonymous(event.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="inline-flex items-center gap-1.5 font-medium">
              <VenetianMask size={15} aria-hidden /> Post anonymously
            </span>
            <span className="block text-xs text-muted">Hidden from everyone, including on your profile. Blocking never reveals it.</span>
          </span>
        </label>

        <label className="flex items-start gap-2">
          <input type="checkbox" checked={warning} onChange={(event) => setWarning(event.target.checked)} className="mt-1" />
          <span>
            <span className="inline-flex items-center gap-1.5 font-medium">
              <TriangleAlert size={15} aria-hidden /> Add a content warning
            </span>
            <span className="block text-xs text-muted">The text stays hidden until the reader taps to show it.</span>
          </span>
        </label>
        {warning && (
          <input
            name="contentWarning"
            maxLength={MAX_CONTENT_WARNING_LENGTH}
            required
            placeholder="e.g. family conflict, grief"
            aria-label="Content warning label"
            className="input"
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="ventDays" className="inline-flex items-center gap-1.5 font-medium">
            <Clock size={15} aria-hidden /> Vent mode
          </label>
          <select id="ventDays" name="ventDays" defaultValue="" className="input w-auto py-1">
            <option value="">Keep this post</option>
            {VENT_OPTIONS.map((option) => (
              <option key={option.days} value={option.days}>
                Disappear after {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          Feeling overwhelmed?{" "}
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
