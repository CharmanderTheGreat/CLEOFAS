"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cooldownEnds, detectImage, formatCooldown } from "@/lib/avatar";
import { createClient } from "@/lib/supabase/server";
import {
  AVATAR_MAX_BYTES,
  MAX_BIO_LENGTH,
  MAX_CONTENT_WARNING_LENGTH,
  MAX_MUTED_WORDS,
  MAX_MUTED_WORD_LENGTH,
  MUTED_WORD_REGEX,
  MAX_POST_LENGTH,
  MAX_REPLY_LENGTH,
  MAX_REPORT_REASON_LENGTH,
  RESERVED_USERNAMES,
  TEMP_USERNAME_REGEX,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  VENT_OPTIONS,
  isValidUsername,
  REACTIONS,
  UUID_REGEX,
  VISIBILITIES,
  type Visibility,
} from "@/lib/constants";
import { fetchPosts } from "@/lib/posts";
import type { FormState, PostRow } from "@/lib/types";

// Helpers ---------------------------------------------------------------------

// Mutations verify the session with the Auth server (getUser), not just the cookie's JWT.
async function context() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

type DbError = { message: string; code?: string };

// Turns a database error into something a person can read.
// Never says WHY something is denied (e.g. a block), so it cannot be used to probe who blocked whom.
function friendly(error: DbError): string {
  if (error.message.includes("rate_limit_exceeded")) {
    return "You're doing that too fast. Please wait a few minutes and try again.";
  }
  if (error.message.includes("cooldown_username")) return "You can only change your username once every 7 days.";
  if (error.message.includes("cooldown_avatar")) return "You can only change your picture once every 7 days.";
  if (error.message.includes("invalid_username")) return "That username isn't allowed. Please pick another one.";
  if (error.code === "23505") {
    if (error.message.includes("reports_unique")) return "You already reported this.";
    return "That username is already taken.";
  }
  if (error.code === "23514") return "Some of the values are not allowed. Please check your input.";
  if (error.code === "42501" || error.message.toLowerCase().includes("row-level security")) {
    return "You're not allowed to do that.";
  }
  return "Something went wrong. Please try again.";
}

const FAILED: FormState = { error: "Something went wrong. Please try again." };

function isVisibility(value: string): value is Visibility {
  return (VISIBILITIES as readonly string[]).includes(value);
}

// Auth ------------------------------------------------------------------------

export async function signOut() {
  const { supabase } = await context();
  await supabase.auth.signOut();
  redirect("/login");
}

// Deletes the account and everything it owns (posts, replies, follows, blocks, private settings).
export async function deleteAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await context();
  if (text(formData, "confirm").trim().toLowerCase() !== "delete") {
    return { error: 'Type "delete" to confirm.' };
  }
  const { error } = await supabase.rpc("delete_my_account");
  if (error) return { error: friendly(error) };
  await supabase.auth.signOut();
  redirect("/login");
}

// Profile ---------------------------------------------------------------------

function validateProfileFields(formData: FormData) {
  const username = text(formData, "username").trim().toLowerCase();
  const bio = text(formData, "bio").trim();

  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
    return { error: `Username must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters.` } as const;
  }
  if (!isValidUsername(username)) {
    return {
      error:
        "Use letters, numbers and _ . - only. Start and end with a letter or number, and no two symbols in a row.",
    } as const;
  }
  if (TEMP_USERNAME_REGEX.test(username) || (RESERVED_USERNAMES as readonly string[]).includes(username)) {
    return { error: "That username isn't available. Please pick another one." } as const;
  }
  if (bio.length > MAX_BIO_LENGTH) {
    return { error: `Bio can be at most ${MAX_BIO_LENGTH} characters.` } as const;
  }
  return { username, bio: bio || null } as const;
}

// Sets the username and bio (complete_onboarding). The first username is free; after that it is 7 days per change.
export async function completeOnboarding(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await context();

  const fields = validateProfileFields(formData);
  if ("error" in fields) return { error: fields.error };

  const { error } = await supabase.rpc("complete_onboarding", {
    p_username: fields.username,
    p_bio: fields.bio,
  });
  if (error) return { error: friendly(error) };

  revalidatePath("/", "layout");
  redirect("/");
}

export async function updateSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await context();

  const fields = validateProfileFields(formData);
  if ("error" in fields) return { error: fields.error };

  // Only send the username when it really changed, so an unchanged name never trips the 7-day cooldown.
  const { data: current } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
  const changes: { bio: string | null; username?: string } = { bio: fields.bio };
  if (current && current.username !== fields.username) changes.username = fields.username;

  const [profile, priv] = await Promise.all([
    supabase.from("profiles").update(changes).eq("id", user.id),
    supabase
      .from("profile_private")
      .update({ default_anonymous_replies: formData.get("defaultAnonymous") === "on" })
      .eq("id", user.id),
  ]);
  const failure = profile.error ?? priv.error;
  if (failure) return { error: friendly(failure) };

  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}

// Profile picture ------------------------------------------------------------------

// The browser shrinks the picture to 256 px first. Here we re-check size and real file type,
// check the 7-day cooldown BEFORE uploading, and clean up the old file afterwards.
export async function updateAvatar(formData: FormData): Promise<FormState> {
  const { supabase, user } = await context();

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a picture first." };
  if (file.size > AVATAR_MAX_BYTES) return { error: "That picture is too big. Try a smaller one." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = detectImage(bytes);
  if (!image) return { error: "Please use a JPG, PNG or WebP picture." };

  const [privRes, profileRes] = await Promise.all([
    supabase.from("profile_private").select("avatar_changed_at").eq("id", user.id).maybeSingle(),
    supabase.from("profiles").select("avatar_path").eq("id", user.id).maybeSingle(),
  ]);
  const ends = cooldownEnds(privRes.data?.avatar_changed_at);
  if (ends) return { error: `You can change your picture again on ${formatCooldown(ends)}.` };

  const path = `${user.id}/${crypto.randomUUID().replaceAll("-", "")}.${image.ext}`;
  const upload = await supabase.storage
    .from("avatars")
    .upload(path, bytes, { contentType: image.mime, upsert: false, cacheControl: "31536000" });
  if (upload.error) return { error: "Couldn't upload the picture. Please try again." };

  const { error } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", user.id);
  if (error) {
    await supabase.storage.from("avatars").remove([path]);
    return { error: friendly(error) };
  }

  const oldPath = profileRes.data?.avatar_path;
  if (oldPath) await supabase.storage.from("avatars").remove([oldPath]);

  revalidatePath("/", "layout");
  return { ok: true, message: "Picture updated." };
}

export async function removeAvatar(_prev: FormState, _formData: FormData): Promise<FormState> {
  const { supabase, user } = await context();

  const { data: profile } = await supabase.from("profiles").select("avatar_path").eq("id", user.id).maybeSingle();
  if (!profile?.avatar_path) return { ok: true };

  const { error } = await supabase.from("profiles").update({ avatar_path: null }).eq("id", user.id);
  if (error) return { error: friendly(error) };
  await supabase.storage.from("avatars").remove([profile.avatar_path]);

  revalidatePath("/", "layout");
  return { ok: true };
}

// Posts -----------------------------------------------------------------------

export async function createPost(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await context();

  const body = text(formData, "body").trim();
  const visibility = text(formData, "visibility") || "public";
  if (!body) return { error: "Write something first." };
  if (body.length > MAX_POST_LENGTH) return { error: `Posts can be at most ${MAX_POST_LENGTH} characters.` };
  if (!isVisibility(visibility)) return { error: "Invalid visibility." };

  const isAnonymous = formData.get("anonymous") === "on";

  // Optional content warning and vent mode (the post disappears after 1, 3 or 7 days).
  const contentWarning = text(formData, "contentWarning").trim();
  if (contentWarning.length > MAX_CONTENT_WARNING_LENGTH) {
    return { error: `The content warning can be at most ${MAX_CONTENT_WARNING_LENGTH} characters.` };
  }
  const ventRaw = text(formData, "ventDays");
  const ventDays = ventRaw ? Number(ventRaw) : null;
  if (ventDays !== null && !VENT_OPTIONS.some((option) => option.days === ventDays)) {
    return { error: "Invalid vent mode choice." };
  }
  const expiresAt = ventDays ? new Date(Date.now() + ventDays * 24 * 60 * 60 * 1000).toISOString() : null;
  // Anonymous posts are public only: on a mutuals-only post the audience is too small to hide in.
  if (isAnonymous && visibility !== "public") return { error: "Anonymous posts must be public." };

  const { error } = await supabase
    .from("posts")
    .insert({
      author_id: user.id,
      body,
      visibility,
      is_anonymous: isAnonymous,
      content_warning: contentWarning || null,
      expires_at: expiresAt,
    });
  if (error) return { error: friendly(error) };

  revalidatePath("/");
  return { ok: true };
}

export async function updatePost(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await context();

  const id = text(formData, "id");
  const body = text(formData, "body").trim();
  const visibility = text(formData, "visibility");
  if (!isUuid(id)) return FAILED;
  if (!body) return { error: "A post can't be empty." };
  if (body.length > MAX_POST_LENGTH) return { error: `Posts can be at most ${MAX_POST_LENGTH} characters.` };
  if (!isVisibility(visibility)) return { error: "Invalid visibility." };

  const { data, error } = await supabase
    .from("posts")
    .update({ body, visibility })
    .eq("id", id)
    .eq("author_id", user.id)
    .select("id");
  if (error) return { error: friendly(error) };
  if (!data || data.length === 0) return { error: "Couldn't update this post. It may have been deleted." };

  revalidatePath("/", "layout");
  return { ok: true, message: "Updated." };
}

export async function deletePost(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await context();

  const id = text(formData, "id");
  if (!isUuid(id)) return FAILED;

  const { data, error } = await supabase.from("posts").delete().eq("id", id).eq("author_id", user.id).select("id");
  if (error) return { error: friendly(error) };
  if (!data || data.length === 0) return { error: "Couldn't delete this post. It may already be gone." };

  revalidatePath("/", "layout");
  redirect("/");
}

// Replies ---------------------------------------------------------------------

export async function createReply(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await context();

  const postId = text(formData, "postId");
  const body = text(formData, "body").trim();
  if (!isUuid(postId)) return FAILED;
  if (!body) return { error: "Write something first." };
  if (body.length > MAX_REPLY_LENGTH) return { error: `Replies can be at most ${MAX_REPLY_LENGTH} characters.` };

  const { error } = await supabase.from("replies").insert({
    post_id: postId,
    author_id: user.id,
    body,
    is_anonymous: formData.get("anonymous") === "on",
  });
  if (error) return { error: friendly(error) };

  revalidatePath(`/post/${postId}`);
  return { ok: true };
}

export async function updateReply(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await context();

  const id = text(formData, "id");
  const postId = text(formData, "postId");
  const body = text(formData, "body").trim();
  if (!isUuid(id) || !isUuid(postId)) return FAILED;
  if (!body) return { error: "A reply can't be empty." };
  if (body.length > MAX_REPLY_LENGTH) return { error: `Replies can be at most ${MAX_REPLY_LENGTH} characters.` };

  const { data, error } = await supabase.from("replies").update({ body }).eq("id", id).eq("author_id", user.id).select("id");
  if (error) return { error: friendly(error) };
  if (!data || data.length === 0) return { error: "Couldn't update this reply." };

  revalidatePath(`/post/${postId}`);
  return { ok: true, message: "Updated." };
}

// The reply author and the post author may both delete (enforced inside delete_reply()).
export async function deleteReply(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await context();

  const id = text(formData, "id");
  const postId = text(formData, "postId");
  if (!isUuid(id) || !isUuid(postId)) return FAILED;

  const { data, error } = await supabase.rpc("delete_reply", { p_reply_id: id });
  if (error) return { error: friendly(error) };
  if (data !== true) return { error: "Couldn't delete this reply. It may already be gone." };

  revalidatePath(`/post/${postId}`);
  return { ok: true };
}

// Follow / block --------------------------------------------------------------

export async function followUser(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await context();

  const userId = text(formData, "userId");
  if (!isUuid(userId)) return FAILED;

  const { error } = await supabase.from("follows").insert({ follower_id: user.id, following_id: userId });
  // 23505 = already following: the wanted state, so not an error.
  if (error && error.code !== "23505") return { error: friendly(error) };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function unfollowUser(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await context();

  const userId = text(formData, "userId");
  if (!isUuid(userId)) return FAILED;

  const { error } = await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", userId);
  if (error) return { error: friendly(error) };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function blockUser(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await context();

  const userId = text(formData, "userId");
  if (!isUuid(userId)) return FAILED;

  const { error } = await supabase.from("blocks").insert({ blocker_id: user.id, blocked_id: userId });
  if (error && error.code !== "23505") return { error: friendly(error) };

  revalidatePath("/", "layout");
  redirect("/settings");
}

export async function unblockUser(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await context();

  const userId = text(formData, "userId");
  if (!isUuid(userId)) return FAILED;

  const { error } = await supabase.from("blocks").delete().eq("blocker_id", user.id).eq("blocked_id", userId);
  if (error) return { error: friendly(error) };

  revalidatePath("/", "layout");
  return { ok: true };
}

// Reports ---------------------------------------------------------------------

export async function reportContent(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await context();

  const postId = text(formData, "postId") || null;
  const replyId = text(formData, "replyId") || null;
  const reason = text(formData, "reason").trim();
  if (!postId && !replyId) return { error: "Nothing to report." };
  if ((postId && !isUuid(postId)) || (replyId && !isUuid(replyId))) return FAILED;
  if (!reason) return { error: "Please tell us why you're reporting this." };
  if (reason.length > MAX_REPORT_REASON_LENGTH) {
    return { error: `Reason can be at most ${MAX_REPORT_REASON_LENGTH} characters.` };
  }

  const { error } = await supabase
    .from("reports")
    .insert({ reporter_id: user.id, post_id: postId, reply_id: replyId, reason });
  if (error) return { error: friendly(error) };

  return { ok: true, message: "Report sent. Thank you for helping keep Cleofas safe." };
}

// Feed ------------------------------------------------------------------------

// Infinite scroll: the next page of posts after the cursor (created_at, id) of the last post shown.
export async function loadMorePosts(input: {
  authorId: string | null;
  followingOnly: boolean;
  before: string;
  beforeId: string;
}): Promise<{ posts: PostRow[]; hasMore: boolean } | { error: string }> {
  const { supabase } = await context();
  if (input.authorId && !isUuid(input.authorId)) return { error: "Something went wrong." };
  if (!isUuid(input.beforeId) || Number.isNaN(Date.parse(input.before))) return { error: "Something went wrong." };

  try {
    return await fetchPosts(supabase, {
      authorId: input.authorId,
      followingOnly: input.followingOnly,
      before: input.before,
      beforeId: input.beforeId,
    });
  } catch {
    return { error: "Couldn't load more posts. Please try again." };
  }
}

// Muted words ---------------------------------------------------------------------

export async function updateMutedWords(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await context();

  const words = [
    ...new Set(
      text(formData, "words")
        .split(/[,\n]/)
        .map((word) => word.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (words.length > MAX_MUTED_WORDS) return { error: `You can mute at most ${MAX_MUTED_WORDS} words.` };
  const bad = words.find((word) => word.length > MAX_MUTED_WORD_LENGTH || !MUTED_WORD_REGEX.test(word));
  if (bad) {
    return {
      error: `"${bad.slice(0, 20)}" isn't allowed. Use letters, numbers and spaces, up to ${MAX_MUTED_WORD_LENGTH} characters.`,
    };
  }

  const { error } = await supabase.from("profile_private").update({ muted_words: words }).eq("id", user.id);
  if (error) return { error: friendly(error) };

  revalidatePath("/", "layout");
  return { ok: true, message: words.length === 0 ? "No muted words." : `Muting ${words.length} word${words.length === 1 ? "" : "s"}.` };
}

// Notifications ---------------------------------------------------------------------

export async function markNotificationsRead(): Promise<void> {
  const { supabase } = await context();
  await supabase.rpc("mark_notifications_read");
  revalidatePath("/", "layout");
}

// Moderation (admins only: the database functions reject everyone else) ----------------------

export async function adminSetReportStatus(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await context();

  const id = text(formData, "id");
  const status = text(formData, "status");
  if (!isUuid(id) || !["open", "reviewed", "dismissed"].includes(status)) return FAILED;

  const { data, error } = await supabase.rpc("admin_set_report_status", { p_report_id: id, p_status: status });
  if (error) return { error: friendly(error) };
  if (data !== true) return { error: "Report not found." };

  revalidatePath("/admin");
  return { ok: true };
}

export async function adminRemoveTarget(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await context();

  const id = text(formData, "id");
  if (!isUuid(id)) return FAILED;

  const { data, error } = await supabase.rpc("admin_remove_target", { p_report_id: id });
  if (error) return { error: friendly(error) };
  if (data !== true) return { error: "Nothing was removed. It may already be gone." };

  revalidatePath("/admin");
  return { ok: true };
}

// Reactions -------------------------------------------------------------------------

// kind = null removes your reaction. One reaction per person per post, only counts are shown.
export async function setReaction(input: { postId: string; kind: string | null }): Promise<{ error?: string }> {
  const { supabase } = await context();
  if (!isUuid(input.postId)) return { error: "Something went wrong." };
  if (input.kind !== null && !REACTIONS.some((reaction) => reaction.kind === input.kind)) {
    return { error: "Something went wrong." };
  }

  const { error } = await supabase.rpc("set_reaction", { p_post_id: input.postId, p_kind: input.kind });
  if (error) return { error: friendly(error) };
  return {};
}
