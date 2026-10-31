"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { COMPOSE_EVENT } from "./NavBars";
import { PostComposer } from "./PostComposer";

// The composer lives in a pop-up that opens from the write button, so the feed stays clean for scrolling.
// Closing it keeps your draft until you post.
export function ComposeDialog() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    function open() {
      const element = dialog.current;
      if (!element || element.open) return;
      element.showModal();
      element.querySelector("textarea")?.focus();
    }
    window.addEventListener(COMPOSE_EVENT, open);
    return () => window.removeEventListener(COMPOSE_EVENT, open);
  }, []);

  function close() {
    dialog.current?.close();
  }

  return (
    <dialog
      ref={dialog}
      aria-label="Write a post"
      onClick={(event) => {
        // A click on the dark backdrop (the dialog element itself) closes it.
        if (event.target === dialog.current) close();
      }}
      className="m-0 mt-auto w-full max-w-none rounded-t-3xl border border-line bg-paper p-0 text-ink backdrop:bg-black/50 md:m-auto md:max-w-lg md:rounded-3xl"
    >
      <div className="max-h-[90dvh] overflow-y-auto p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">New post</h2>
          <button type="button" onClick={close} aria-label="Close" className="rounded-full p-2 text-muted hover:bg-accent-soft hover:text-accent">
            <X size={20} aria-hidden />
          </button>
        </div>
        <PostComposer
          onPosted={() => {
            close();
            router.refresh();
          }}
        />
      </div>
    </dialog>
  );
}
