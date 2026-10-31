import type { SupabaseClient } from "@supabase/supabase-js";
import { FEED_PAGE_SIZE, UUID_REGEX } from "@/lib/constants";
import type { PostRow } from "@/lib/types";

type ListedPost = Omit<PostRow, "author" | "reply_count" | "reactions" | "my_reaction"> & {
  reactions: PostRow["reactions"] | null;
  my_reaction: PostRow["my_reaction"];
  author_username: string | null;
  author_avatar: string | null;
  reply_count: number | string;
};

export function toPostRow(row: ListedPost): PostRow {
  return {
    id: row.id,
    author_id: row.author_id,
    body: row.body,
    visibility: row.visibility,
    is_anonymous: row.is_anonymous,
    is_mine: row.is_mine,
    content_warning: row.content_warning,
    expires_at: row.expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    author: row.author_username ? { username: row.author_username, avatar_path: row.author_avatar } : null,
    reply_count: Number(row.reply_count),
    reactions: row.reactions ?? {},
    my_reaction: row.my_reaction ?? null,
  };
}

// "before" / "beforeId" come from the URL or the client, so only accept real values.
export function parseBefore(value: string | undefined | null): string | null {
  return value && !Number.isNaN(Date.parse(value)) ? value : null;
}
export function parseId(value: string | undefined | null): string | null {
  return value && UUID_REGEX.test(value) ? value : null;
}

// Feed / profile posts in one database call (posts + author + visible reply count).
// Visibility, blocks, anonymity and muted words are all applied inside list_posts().
// The cursor is (before, beforeId) = (created_at, id) of the last post you already have.
export async function fetchPosts(
  supabase: SupabaseClient,
  opts: { authorId?: string | null; followingOnly?: boolean; before?: string | null; beforeId?: string | null },
): Promise<{ posts: PostRow[]; hasMore: boolean }> {
  const { data, error } = await supabase.rpc("list_posts", {
    p_author: opts.authorId ?? null,
    p_following_only: opts.followingOnly ?? false,
    p_before: parseBefore(opts.before),
    p_limit: FEED_PAGE_SIZE + 1,
    p_before_id: parseId(opts.beforeId),
  });
  if (error) throw new Error("Could not load posts.");

  const rows = (data ?? []) as ListedPost[];
  return {
    posts: rows.slice(0, FEED_PAGE_SIZE).map(toPostRow),
    hasMore: rows.length > FEED_PAGE_SIZE,
  };
}
