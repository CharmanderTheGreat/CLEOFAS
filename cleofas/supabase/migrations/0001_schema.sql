-- Cleofas: tables and indexes (PROJECT.md section 5)
-- Run order: 0001_schema -> 0002_functions -> 0003_rls

-- profiles ---------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text,
  bio text,
  -- Small addition to the data model: backs the "reply identity" settings option (section 3.3).
  -- When true, the reply composer starts with "anonymous" ticked.
  default_anonymous_replies boolean not null default false,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$'),
  constraint profiles_display_name_len check (display_name is null or char_length(display_name) <= 50),
  constraint profiles_bio_len check (bio is null or char_length(bio) <= 160)
);

create unique index profiles_username_key on public.profiles (username);

-- follows ----------------------------------------------------------------
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self check (follower_id <> following_id)
);

create index follows_following_idx on public.follows (following_id, created_at desc);

-- blocks -----------------------------------------------------------------
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_no_self check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id);

-- posts ------------------------------------------------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  visibility text not null default 'public',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_body_len check (char_length(btrim(body)) >= 1 and char_length(body) <= 1000),
  constraint posts_visibility_valid check (visibility in ('public', 'mutuals'))
);

create index posts_author_created_idx on public.posts (author_id, created_at desc);
create index posts_created_idx on public.posts (created_at desc);

-- replies ----------------------------------------------------------------
-- author_id is always stored (moderation + blocking) but clients must never
-- read it for anonymous replies. Clients read replies only through get_replies().
create table public.replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  constraint replies_body_len check (char_length(btrim(body)) >= 1 and char_length(body) <= 500)
);

create index replies_post_created_idx on public.replies (post_id, created_at);
create index replies_author_created_idx on public.replies (author_id, created_at desc);

-- reports ----------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid references public.posts (id) on delete cascade,
  reply_id uuid references public.replies (id) on delete cascade,
  reason text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  constraint reports_target_present check (post_id is not null or reply_id is not null),
  constraint reports_reason_len check (char_length(btrim(reason)) >= 1 and char_length(reason) <= 500),
  constraint reports_status_valid check (status in ('open', 'reviewed', 'dismissed'))
);

create index reports_status_idx on public.reports (status, created_at desc);
create index reports_reporter_idx on public.reports (reporter_id, created_at desc);
