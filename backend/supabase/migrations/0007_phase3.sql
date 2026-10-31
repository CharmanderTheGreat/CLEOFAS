-- Cleofas 0007: Phase 3
--   1. Profiles: no display name, usernames 5-20 characters (letters, numbers, _ . -),
--      optional profile picture, 7-day cooldown for changing the username or the picture
--   2. Vent mode: posts can disappear after 1, 3 or 7 days (hidden at once, purged by a schedule)
--   3. Content warnings on posts
--   4. Reactions (hug, relate, strength, care): one per person per post, shown as counts only
--   5. Storage bucket for profile pictures
-- Run after 0006_phase2.sql.

-- 1. Profiles ----------------------------------------------------------------------------------
alter table public.profiles drop column display_name;
alter table public.profiles add column avatar_path text;
alter table public.profiles
  add constraint profiles_avatar_path_format
  check (
    avatar_path is null
    or (avatar_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{8,64}\.(webp|jpg|png)$' and avatar_path like id::text || '/%')
  );

-- Old rule (3-20 of a-z 0-9 _) becomes a loose safety net. The real rule (5-20, start and end with a
-- letter or number, no two symbols in a row) is checked by profiles_guard() whenever a username
-- CHANGES, so people who already have a shorter username are not locked out of editing their profile.
alter table public.profiles drop constraint profiles_username_format;
alter table public.profiles
  add constraint profiles_username_format check (username ~ '^[a-z0-9_.-]{3,20}$');

alter table public.profile_private
  add column username_changed_at timestamptz,
  add column avatar_changed_at timestamptz;

revoke update on public.profiles from authenticated;
grant update (username, bio, avatar_path) on public.profiles to authenticated;
grant insert (is_anonymous) on public.posts to authenticated;

create or replace function public.profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_username_at timestamptz;
  v_avatar_at timestamptz;
begin
  select pp.username_changed_at, pp.avatar_changed_at
  into v_username_at, v_avatar_at
  from public.profile_private pp
  where pp.id = new.id;

  if new.username is distinct from old.username then
    if new.username !~ '^[a-z0-9][a-z0-9_.-]{3,18}[a-z0-9]$'
       or new.username ~ '[._-]{2}'
       or new.username ~ '^user_[0-9a-f]{8}$' then
      raise exception 'invalid_username' using errcode = '23514';
    end if;

    -- Picking a username for the first time (from the temporary one) is free and starts no timer.
    if old.username !~ '^user_[0-9a-f]{8}$' then
      if v_username_at is not null and v_username_at > now() - interval '7 days' then
        raise exception 'cooldown_username' using errcode = 'P0001';
      end if;
      update public.profile_private set username_changed_at = now() where id = new.id;
    end if;
  end if;

  if new.avatar_path is distinct from old.avatar_path then
    if v_avatar_at is not null and v_avatar_at > now() - interval '7 days' then
      raise exception 'cooldown_avatar' using errcode = 'P0001';
    end if;
    update public.profile_private set avatar_changed_at = now() where id = new.id;
  end if;

  return new;
end;
$$;

create trigger profiles_guard_trg
  before update on public.profiles
  for each row execute function public.profiles_guard();

drop function public.complete_onboarding(text, text, text);
create or replace function public.complete_onboarding(p_username text, p_bio text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  update public.profiles
  set username = p_username,
      bio = nullif(btrim(p_bio), '')
  where id = auth.uid();
end;
$$;

-- 2. Vent mode and content warnings --------------------------------------------------------------
alter table public.posts
  add column content_warning text,
  add column expires_at timestamptz,
  add constraint posts_content_warning_len check (content_warning is null or char_length(content_warning) between 1 and 80),
  add constraint posts_expires_range check (
    expires_at is null or (expires_at > created_at and expires_at <= created_at + interval '30 days')
  );
grant insert (content_warning, expires_at) on public.posts to authenticated;

create index posts_expires_idx on public.posts (expires_at) where expires_at is not null;

drop policy posts_select on public.posts;
drop function public.post_visible(uuid, text, boolean);

-- Expired posts are invisible to everyone (the author too), even before the purge runs.
create or replace function public.post_visible(
  p_author uuid,
  p_visibility text,
  p_anonymous boolean default false,
  p_expires timestamptz default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and (p_expires is null or p_expires > now())
    and (
      p_author = auth.uid()
      or p_anonymous
      or (
        not public.is_blocked(auth.uid(), p_author)
        and (
          p_visibility = 'public'
          or (p_visibility = 'mutuals' and public.is_mutual(auth.uid(), p_author))
        )
      )
    );
$$;

create policy posts_select on public.posts
  for select to authenticated
  using (
    (expires_at is null or expires_at > now())
    and (
      author_id = (select auth.uid())
      or (not is_anonymous and public.post_visible(author_id, visibility, false, expires_at))
    )
  );

create or replace function public.can_view_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_post_id and public.post_visible(p.author_id, p.visibility, p.is_anonymous, p.expires_at)
  );
$$;

-- Deletes expired posts (and their replies, notifications and reactions). Called by the schedule below.
create or replace function public.purge_expired_posts()
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  delete from public.posts where expires_at is not null and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Schedule it every 15 minutes when pg_cron is available (Supabase: Database > Extensions > pg_cron).
-- Without it nothing breaks: expired posts are already hidden, they just stay in the table.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.schedule('cleofas-purge-expired', '*/15 * * * *', 'select public.purge_expired_posts()');
    exception when others then
      raise notice 'pg_cron could not be set up: %', sqlerrm;
    end;
  end if;
end;
$$;

-- 3. Reactions -------------------------------------------------------------------------------------
-- Closed table: you can only read your own reaction and the counts, through the functions below.
-- Counts ignore blocks on purpose, so a count that drops after a block can never reveal who reacted.
create table public.reactions (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('hug', 'relate', 'strength', 'care')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index reactions_user_idx on public.reactions (user_id, created_at desc);

alter table public.reactions enable row level security;
revoke all on public.reactions from anon, authenticated;

-- One reaction per person per post. p_kind = null removes it.
create or replace function public.set_reaction(p_post_id uuid, p_kind text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_kind is not null and p_kind not in ('hug', 'relate', 'strength', 'care') then
    raise exception 'invalid_reaction' using errcode = '22023';
  end if;
  if not public.can_view_post(p_post_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_kind is null then
    delete from public.reactions where post_id = p_post_id and user_id = v_uid;
    return true;
  end if;

  if (select count(*) from public.reactions where user_id = v_uid and created_at > now() - interval '1 hour') >= 200 then
    raise exception 'rate_limit_exceeded' using errcode = 'P0001';
  end if;

  insert into public.reactions (post_id, user_id, kind)
  values (p_post_id, v_uid, p_kind)
  on conflict (post_id, user_id) do update set kind = excluded.kind, created_at = now();
  return true;
end;
$$;

create or replace function public.post_reactions(p_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb)
  from (select kind, count(*) as n from public.reactions where post_id = p_post_id group by kind) counts;
$$;

-- 4. Reading functions (display name gone, avatar, content warning, vent mode, reactions) -------------
drop function public.get_post(uuid);
drop function public.get_replies(uuid);
drop function public.list_posts(uuid, boolean, timestamptz, integer, uuid);
drop function public.search_profiles(text);
drop function public.get_notifications(integer);

create or replace function public.get_post(p_post_id uuid)
returns table (
  id uuid,
  author_id uuid,
  body text,
  visibility text,
  is_anonymous boolean,
  content_warning text,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  author_username text,
  author_avatar text,
  is_mine boolean,
  reply_count bigint,
  reactions jsonb,
  my_reaction text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (select auth.uid() as uid),
  hidden as (
    select blocked_id as other from public.blocks where blocker_id = (select uid from me)
    union
    select blocker_id from public.blocks where blocked_id = (select uid from me)
  ),
  mw as (
    select pp.muted_words as words from public.profile_private pp where pp.id = (select uid from me)
  )
  select
    p.id,
    case when p.is_anonymous then null else p.author_id end,
    p.body,
    p.visibility,
    p.is_anonymous,
    p.content_warning,
    p.expires_at,
    p.created_at,
    p.updated_at,
    case when p.is_anonymous then null else pr.username end,
    case when p.is_anonymous then null else pr.avatar_path end,
    (p.author_id = (select uid from me)),
    (
      select count(*)
      from public.replies r
      where r.post_id = p.id
        and (
          r.author_id = (select uid from me)
          or (
            (r.is_anonymous or r.author_id not in (select other from hidden))
            and not public.word_muted(r.body, coalesce((select words from mw), '{}'))
          )
        )
    ),
    public.post_reactions(p.id),
    (select rx.kind from public.reactions rx where rx.post_id = p.id and rx.user_id = (select uid from me))
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  where p.id = p_post_id
    and public.post_visible(p.author_id, p.visibility, p.is_anonymous, p.expires_at);
$$;

create or replace function public.get_replies(p_post_id uuid)
returns table (
  id uuid,
  post_id uuid,
  body text,
  is_anonymous boolean,
  created_at timestamptz,
  author_id uuid,
  username text,
  avatar_path text,
  is_mine boolean,
  can_delete boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (select auth.uid() as uid),
  post as (
    select p.author_id
    from public.posts p
    where p.id = p_post_id and public.post_visible(p.author_id, p.visibility, p.is_anonymous, p.expires_at)
  ),
  hidden as (
    select blocked_id as other from public.blocks where blocker_id = (select uid from me)
    union
    select blocker_id from public.blocks where blocked_id = (select uid from me)
  ),
  mw as (
    select pp.muted_words as words from public.profile_private pp where pp.id = (select uid from me)
  )
  select
    r.id,
    r.post_id,
    r.body,
    r.is_anonymous,
    r.created_at,
    case when r.is_anonymous then null else r.author_id end,
    case when r.is_anonymous then null else pr.username end,
    case when r.is_anonymous then null else pr.avatar_path end,
    (r.author_id = (select uid from me)) as is_mine,
    (r.author_id = (select uid from me) or post.author_id = (select uid from me)) as can_delete
  from post
  join public.replies r on r.post_id = p_post_id
  join public.profiles pr on pr.id = r.author_id
  where r.author_id = (select uid from me)
     or (
       (r.is_anonymous or r.author_id not in (select other from hidden))
       and not public.word_muted(r.body, coalesce((select words from mw), '{}'))
     )
  order by r.created_at asc, r.id asc
  limit 500;
$$;

create or replace function public.list_posts(
  p_author uuid default null,
  p_following_only boolean default false,
  p_before timestamptz default null,
  p_limit integer default 21,
  p_before_id uuid default null
)
returns table (
  id uuid,
  author_id uuid,
  body text,
  visibility text,
  is_anonymous boolean,
  content_warning text,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  author_username text,
  author_avatar text,
  is_mine boolean,
  reply_count bigint,
  reactions jsonb,
  my_reaction text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (select auth.uid() as uid),
  hidden as (
    select blocked_id as other from public.blocks where blocker_id = (select uid from me)
    union
    select blocker_id from public.blocks where blocked_id = (select uid from me)
  ),
  mw as (
    select pp.muted_words as words from public.profile_private pp where pp.id = (select uid from me)
  ),
  page as (
    select p.*
    from public.posts p
    where (p_author is null or p.author_id = p_author)
      -- Anonymous posts never show on someone's profile (only on your own), and never in the
      -- Following tab: appearing there would reveal that the author is someone you follow.
      and (not p.is_anonymous or p.author_id = (select uid from me) or (p_author is null and not p_following_only))
      and (
        p_before is null
        or (p.created_at, p.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
      )
      and (
        not p_following_only
        or p.author_id = (select uid from me)
        or exists (
          select 1 from public.follows f
          where f.follower_id = (select uid from me) and f.following_id = p.author_id
        )
      )
      and public.post_visible(p.author_id, p.visibility, p.is_anonymous, p.expires_at)
      and (
        p.author_id = (select uid from me)
        or not public.word_muted(p.body, coalesce((select words from mw), '{}'))
      )
    order by p.created_at desc, p.id desc
    limit least(greatest(coalesce(p_limit, 21), 1), 51)
  )
  select
    page.id,
    case when page.is_anonymous then null else page.author_id end,
    page.body,
    page.visibility,
    page.is_anonymous,
    page.content_warning,
    page.expires_at,
    page.created_at,
    page.updated_at,
    case when page.is_anonymous then null else pr.username end,
    case when page.is_anonymous then null else pr.avatar_path end,
    (page.author_id = (select uid from me)),
    (
      select count(*)
      from public.replies r
      where r.post_id = page.id
        and (
          r.author_id = (select uid from me)
          or (
            (r.is_anonymous or r.author_id not in (select other from hidden))
            and not public.word_muted(r.body, coalesce((select words from mw), '{}'))
          )
        )
    ),
    public.post_reactions(page.id),
    (select rx.kind from public.reactions rx where rx.post_id = page.id and rx.user_id = (select uid from me))
  from page
  join public.profiles pr on pr.id = page.author_id
  order by page.created_at desc, page.id desc;
$$;

create or replace function public.search_profiles(p_term text)
returns table (id uuid, username text, avatar_path text)
language sql
stable
set search_path = public, pg_temp
as $$
  select p.id, p.username, p.avatar_path
  from public.profiles p
  where p_term ~ '^[a-z0-9_.-]{2,20}$'
    and p.username like replace(p_term, '_', '\_') || '%'
    and p.id <> auth.uid()
    and not public.is_blocked(auth.uid(), p.id)
  order by p.username collate "C"
  limit 20;
$$;

create or replace function public.get_notifications(p_limit integer default 50)
returns table (
  id uuid,
  post_id uuid,
  reply_id uuid,
  created_at timestamptz,
  is_read boolean,
  is_anonymous boolean,
  actor_username text,
  actor_avatar text,
  reply_snippet text,
  post_snippet text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (select auth.uid() as uid),
  hidden as (
    select blocked_id as other from public.blocks where blocker_id = (select uid from me)
    union
    select blocker_id from public.blocks where blocked_id = (select uid from me)
  )
  select
    n.id,
    n.post_id,
    n.reply_id,
    n.created_at,
    n.read_at is not null,
    r.is_anonymous,
    case when r.is_anonymous then null else pr.username end,
    case when r.is_anonymous then null else pr.avatar_path end,
    left(r.body, 140),
    left(p.body, 80)
  from public.notifications n
  join public.replies r on r.id = n.reply_id
  join public.posts p on p.id = n.post_id
  join public.profiles pr on pr.id = r.author_id
  where n.user_id = (select uid from me)
    and (r.is_anonymous or r.author_id not in (select other from hidden))
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

-- 5. Profile pictures: storage bucket and policies (only on Supabase) -----------------------------------
-- Each person can only write inside their own folder (<user id>/...). Pictures are small
-- (the app shrinks them to 256 px) and the bucket enforces a size and type limit too.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('avatars', 'avatars', true, 307200, array['image/webp', 'image/jpeg', 'image/png'])
    on conflict (id) do update
      set public = true,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;

    execute 'drop policy if exists cleofas_avatars_select on storage.objects';
    execute 'drop policy if exists cleofas_avatars_insert on storage.objects';
    execute 'drop policy if exists cleofas_avatars_delete on storage.objects';
    execute $p$
      create policy cleofas_avatars_select on storage.objects
        for select to authenticated
        using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
    $p$;
    execute $p$
      create policy cleofas_avatars_insert on storage.objects
        for insert to authenticated
        with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
    $p$;
    execute $p$
      create policy cleofas_avatars_delete on storage.objects
        for delete to authenticated
        using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
    $p$;
  end if;
end;
$$;

-- 6. Grants ---------------------------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_mutual(uuid, uuid),
  public.is_blocked(uuid, uuid),
  public.post_visible(uuid, text, boolean, timestamptz),
  public.can_view_post(uuid),
  public.can_view_reply(uuid),
  public.get_post(uuid),
  public.get_replies(uuid),
  public.delete_reply(uuid),
  public.list_posts(uuid, boolean, timestamptz, integer, uuid),
  public.search_profiles(text),
  public.complete_onboarding(text, text),
  public.delete_my_account(),
  public.get_notifications(integer),
  public.unread_notification_count(),
  public.mark_notifications_read(),
  public.muted_words_valid(text[]),
  public.set_reaction(uuid, text),
  public.is_admin(),
  public.admin_list_reports(text, integer, integer),
  public.admin_set_report_status(uuid, text),
  public.admin_remove_target(uuid)
  to authenticated;
