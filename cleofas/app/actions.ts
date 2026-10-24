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
  USERNAME_REGEX,
  VISIBILITIES,
  type Visibility,
} from "@/lib/constants";
import type { FormState } from "@/lib/types";

// Helpers ---------------------------------------------------------------------

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

// Turns a database error into something a person can read.
function friendly(error: { message: string; code?: string }): string {
  if (error.message.includes("rate_limit_exceeded")) {
    return "You're doing that too fast. Please wait a few minutes and try again.";
  }
  if (error.code === "23505") return "That username is already taken.";
  if (error.code === "23514") return "Some of the values are not allowed. Please check your input.";
  if (error.code === "42501" || error.message.toLowerCase().includes("row-level security")) {
    return "You're not allowed to do that. The post may no longer be visible to you.";
  }
  return "Something went wrong. Please try again.";
}

function isVisibility(value: string): value is Visibility {
  return (VISIBILITIES as readonly string[]).includes(value);
}

// Auth ------------------------------------------------------------------------

export async function signOut() {
  const { supabase } = await context();
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
  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    return { error: `Display name can be at most ${MAX_DISPLAY_NAME_LENGTH} characters.` } as const;
  }
  if (bio.length > MAX_BIO_LENGTH) {
    return { error: `Bio can be at most ${MAX_BIO_LENGTH} characters.` } as const;
  }
  return { username, displayName: displayName || null, bio: bio || null } as const;
}

export async function completeOnboarding(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await context();

  if (formData.get("ageConfirmed") !== "on") {
    return { error: "Please confirm the age requirement to continue." };
  }
  const fields = validateProfileFields(formData);
  if ("error" in fields) return { error: fields.error };

  const { error } = await supabase
    .from("profiles")
    .update({ username: fields.username, display_name: fields.displayName, bio: fields.bio })
    .eq("id", user.id);
  if (error) return { error: friendly(error) };

  redirect("/");
}

export async function updateSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await context();

  const fields = validateProfileFields(formData);
  if ("error" in fields) return { error: fields.error };

  const { error } = await supabase
    .from("profiles")
    .update({
      username: fields.username,
      display_name: fields.displayName,
      bio: fields.bio,
      default_anonymous_replies: formData.get("defaultAnonymous") === "on",
    })
    .eq("id", user.id);
  if (error) return { error: friendly(error) };

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
  if (!body) return { error: "A post can't be empty." };
  if (body.length > MAX_POST_LENGTH) return { error: `Posts can be at most ${MAX_POST_LENGTH} characters.` };
  if (!isVisibility(visibility)) return { error: "Invalid visibility." };

  const { error } = await supabase
    .from("posts")
    .update({ body, visibility })
    .eq("id", id)
    .eq("author_id", user.id);
  if (error) return { error: friendly(error) };

  revalidatePath("/", "layout");
  return { ok: true, message: "Updated." };
}

export async function deletePost(formData: FormData) {
  const { supabase, user } = await context();
  const id = text(formData, "id");
  await supabase.from("posts").delete().eq("id", id).eq("author_id", user.id);
  revalidatePath("/", "layout");
  redirect("/");
}

// Replies ---------------------------------------------------------------------

export async function createReply(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await context();

  const postId = text(formData, "postId");
  const body = text(formData, "body").trim();
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
  if (!body) return { error: "A reply can't be empty." };
  if (body.length > MAX_REPLY_LENGTH) return { error: `Replies can be at most ${MAX_REPLY_LENGTH} characters.` };

  const { error } = await supabase.from("replies").update({ body }).eq("id", id).eq("author_id", user.id);
  if (error) return { error: friendly(error) };

  revalidatePath(`/post/${postId}`);
  return { ok: true, message: "Updated." };
}

// The reply author and the post author may both delete (enforced inside delete_reply()).
export async function deleteReply(formData: FormData) {
  const { supabase } = await context();
  await supabase.rpc("delete_reply", { p_reply_id: text(formData, "id") });
  revalidatePath(`/post/${text(formData, "postId")}`);
}

// Follow / block --------------------------------------------------------------

export async function followUser(formData: FormData) {
  const { supabase, user } = await context();
  await supabase.from("follows").insert({ follower_id: user.id, following_id: text(formData, "userId") });
  revalidatePath("/", "layout");
}

export async function unfollowUser(formData: FormData) {
  const { supabase, user } = await context();
  await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", text(formData, "userId"));
  revalidatePath("/", "layout");
}

export async function blockUser(formData: FormData) {
  const { supabase, user } = await context();
  await supabase.from("blocks").insert({ blocker_id: user.id, blocked_id: text(formData, "userId") });
  revalidatePath("/", "layout");
  redirect("/settings");
}

export async function unblockUser(formData: FormData) {
  const { supabase, user } = await context();
  await supabase.from("blocks").delete().eq("blocker_id", user.id).eq("blocked_id", text(formData, "userId"));
  revalidatePath("/", "layout");
}

// Reports ---------------------------------------------------------------------

export async function reportContent(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await context();

  const postId = text(formData, "postId") || null;
  const replyId = text(formData, "replyId") || null;
  const reason = text(formData, "reason").trim();
  if (!postId && !replyId) return { error: "Nothing to report." };
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
