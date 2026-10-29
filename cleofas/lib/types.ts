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
};

export type PostRow = {
  id: string;
  author_id: string;
  body: string;
  visibility: Visibility;
  created_at: string;
  updated_at: string;
  author: { username: string; display_name: string | null } | null;
  reply_count?: number;
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
