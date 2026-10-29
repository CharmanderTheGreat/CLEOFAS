"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_BIO_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_POST_LENGTH,
  MAX_REPLY_LENGTH,
  MAX_REPORT_REASON_LENGTH,
  RESERVED_USERNAMES,
  TEMP_USERNAME_REGEX,
  USERNAME_REGEX,
  UUID_REGEX,
  VISIBILITIES,
  type Visibility,
} from "@/lib/constants";
import type { FormState } from "@/lib/types";

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
  const displayName = text(formData, "displayName").trim();
  const bio = text(formData, "bio").trim();

  if (!USERNAME_REGEX.test(username)) {
    return { error: "Username must be 3-20 characters: lowercase letters, numbers and underscore only." } as const;
  }
  if (TEMP_USERNAME_REGEX.test(username) || (RESERVED_USERNAMES as readonly string[]).includes(username)) {
    return { error: "That username isn't available. Please pick another one." } as const;
  }
  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    return { error: `Display name can be at most ${MAX_DISPLAY_NAME_LENGTH} characters.` } as const;
  }
  if (bio.length > MAX_BIO_LENGTH) {
    return { error: `Bio can be at most ${MAX_BIO_LENGTH} characters.` } as const;
  }
  return { username, displayName: displayName || null, bio: bio || null } as const;
}

// Sets the username, display name and bio (complete_onboarding).
export async function completeOnboarding(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await context();

  const fields = validateProfileFields(formData);
  if ("error" in fields) return { error: fields.error };

  const { error } = await supabase.rpc("complete_onboarding", {
    p_username: fields.username,
    p_display_name: fields.displayName,
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

  const [profile, priv] = await Promise.all([
    supabase
      .from("profiles")
      .update({ username: fields.username, display_name: fields.displayName, bio: fields.bio })
      .eq("id", user.id),
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

// Posts -----------------------------------------------------------------------

export async function createPost(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await context();

  const body = text(formData, "body").trim();
  const visibility = text(formData, "visibility") || "public";
  if (!body) return { error: "Write something first." };
  if (body.length > MAX_POST_LENGTH) return { error: `Posts can be at most ${MAX_POST_LENGTH} characters.` };
  if (!isVisibility(visibility)) return { error: "Invalid visibility." };

  const { error } = await supabase.from("posts").insert({ author_id: user.id, body, visibility });
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
