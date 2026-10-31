"use client";

import { useEffect, useState, useTransition } from "react";
import { setReaction } from "@/app/actions";
import { REACTIONS, type ReactionKind } from "@/lib/constants";

type Counts = Partial<Record<ReactionKind, number>>;

// Reactions instead of likes: only counts are shown, never who reacted. One reaction per person,
// tap it again to take it back.
export function ReactionBar({ postId, counts, mine }: { postId: string; counts: Counts; mine: ReactionKind | null }) {
  const [state, setState] = useState({ counts, mine });
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Fresh data from the server (refresh, live update) replaces what we show.
  useEffect(() => setState({ counts, mine }), [counts, mine]);

  function choose(kind: ReactionKind) {
    const previous = state;
    const next = previous.mine === kind ? null : kind;

    const nextCounts = { ...previous.counts };
    if (previous.mine) nextCounts[previous.mine] = Math.max(0, (nextCounts[previous.mine] ?? 1) - 1);
    if (next) nextCounts[next] = (nextCounts[next] ?? 0) + 1;

    setState({ counts: nextCounts, mine: next });
    setError(null);
    startTransition(async () => {
      const result = await setReaction({ postId, kind: next });
      if (result.error) {
        setState(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Reactions">
        {REACTIONS.map(({ kind, emoji, label }) => {
          const active = state.mine === kind;
          const count = state.counts[kind] ?? 0;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => choose(kind)}
              aria-pressed={active}
              title={label}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition active:scale-95 ${
                active ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:border-accent hover:text-ink"
              }`}
            >
              <span aria-hidden>{emoji}</span>
              <span className="sr-only">{label}</span>
              {count > 0 && <span className="text-xs font-medium tabular-nums">{count}</span>}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
