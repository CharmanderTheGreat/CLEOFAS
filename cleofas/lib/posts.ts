import type { SupabaseClient } from "@supabase/supabase-js";
import { FEED_PAGE_SIZE } from "@/lib/constants";
import type { PostRow } from "@/lib/types";

type ListedPost = Omit<PostRow, "author" | "reply_count"> & {
  author_username: string;
  author_display_name: string | null;
  reply_count: number | string;
};

// "before" comes from the URL, so only accept a real timestamp.
export function parseBefore(value: string | undefined): string | null {
  return value && !Number.isNaN(Date.parse(value)) ? value : null;
}

// Feed / profile posts in one database call (posts + author + visible reply count).
// Visibility, blocks and the age gate are all applied inside list_posts().
export async function fetchPosts(
  supabase: SupabaseClient,
  opts: { authorId?: string; followingOnly?: boolean; before?: string },
): Promise<{ posts: PostRow[]; hasMore: boolean }> {
  const { data, error } = await supabase.rpc("list_posts", {
    p_author: opts.authorId ?? null,
    p_following_only: opts.followingOnly ?? false,
    p_before: parseBefore(opts.before),
    p_limit: FEED_PAGE_SIZE + 1,
  });
  if (error) throw new Error("Could not load posts.");

  const rows = (data ?? []) as ListedPost[];
  const posts = rows.slice(0, FEED_PAGE_SIZE).map((row) => ({
    id: row.id,
    author_id: row.author_id,
    body: row.body,
    visibility: row.visibility,
    created_at: row.created_at,
    updated_at: row.updated_at,
    author: { username: row.author_username, display_name: row.author_display_name },
    reply_count: Number(row.reply_count),
  }));
  return { posts, hasMore: rows.length > FEED_PAGE_SIZE };
}
