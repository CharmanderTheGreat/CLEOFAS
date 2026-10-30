"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadMorePosts } from "@/app/actions";
import type { PostRow } from "@/lib/types";
import { PostCard } from "./PostCard";

type Props = {
  initialPosts: PostRow[];
  initialHasMore: boolean;
  authorId?: string | null;
  followingOnly?: boolean;
  emptyMessage: string;
};

// Infinite scroll: loads the next page when the bottom comes into view. The "Load more" button
// is the fallback if the observer is not available or a load failed.
export function PostList({ initialPosts, initialHasMore, authorId = null, followingOnly = false, emptyMessage }: Props) {
  const [posts, setPosts] = useState(initialPosts);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  // A new first page (after a refresh, new post, filter change) replaces the list.
  useEffect(() => {
    setPosts(initialPosts);
    setHasMore(initialHasMore);
    setError(null);
  }, [initialPosts, initialHasMore]);

  const loadMore = useCallback(async () => {
    const last = posts[posts.length - 1];
    if (!last || busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await loadMorePosts({
        authorId,
        followingOnly,
        before: last.created_at,
        beforeId: last.id,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setPosts((current) => {
        const known = new Set(current.map((post) => post.id));
        return [...current, ...result.posts.filter((post) => !known.has(post.id))];
      });
      setHasMore(result.hasMore);
    } catch {
      setError("Couldn't load more posts. Please try again.");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [posts, authorId, followingOnly]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "300px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, error, loadMore]);

  if (posts.length === 0) {
    return <p className="py-10 text-center text-sm text-muted">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} replyCount={post.reply_count ?? 0} />
      ))}

      <div ref={sentinel} className="py-4 text-center">
        {loading && <p className="text-sm text-muted">Loading…</p>}
        {error && (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
            <button type="button" onClick={() => void loadMore()} className="btn-ghost">
              Try again
            </button>
          </div>
        )}
        {!loading && !error && hasMore && (
          <button type="button" onClick={() => void loadMore()} className="btn-ghost">
            Load more
          </button>
        )}
        {!hasMore && posts.length > 5 && <p className="text-xs text-muted">You&apos;re all caught up.</p>}
      </div>
    </div>
  );
}
