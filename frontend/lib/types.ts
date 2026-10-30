import type { Visibility } from "./constants";

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  created_at: string;
};

// The signed-in user: public profile + their private settings (profile_private, own row only).
export type Viewer = Profile & {
  default_anonymous_replies: boolean;
  muted_words: string[];
};

// author / author_id are null for anonymous posts (the database blanks them for everyone, even you).
export type PostRow = {
  id: string;
  author_id: string | null;
  body: string;
  visibility: Visibility;
  is_anonymous: boolean;
  is_mine: boolean;
  created_at: string;
  updated_at: string;
  author: { username: string; display_name: string | null } | null;
  reply_count?: number;
};

// Shape returned by get_notifications(). actor_username is null for anonymous replies.
export type NotificationRow = {
  id: string;
  post_id: string;
  reply_id: string;
  created_at: string;
  is_read: boolean;
  is_anonymous: boolean;
  actor_username: string | null;
  reply_snippet: string;
  post_snippet: string;
};

// Shape returned by admin_list_reports().
export type AdminReportRow = {
  id: string;
  status: "open" | "reviewed" | "dismissed";
  reason: string;
  created_at: string;
  reporter_username: string | null;
  target_kind: "post" | "reply";
  target_exists: boolean;
  target_body: string | null;
  target_author_id: string | null;
  target_username: string | null;
  target_is_anonymous: boolean | null;
};

// Shape returned by the get_replies() database function.
// author_id / username / display_name are null for anonymous replies.
export type ReplyRow = {
  id: string;
  post_id: string;
  body: string;
  is_anonymous: boolean;
  created_at: string;
  author_id: string | null;
  username: string | null;
  display_name: string | null;
  is_mine: boolean;
  can_delete: boolean;
};

export type FormState = { error?: string; ok?: boolean; message?: string } | undefined;
