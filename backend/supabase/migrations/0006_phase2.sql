-- Cleofas 0006: Phase 2
--   1. Anonymous posts (public only; blocks and follows never reveal the author)
--   2. Notifications for replies (anonymous replies never reveal the replier)
--   3. Muted words (per user, applied to feed posts and replies)
--   4. Admin moderation (admins table + RPCs, no service key needed in the app)
--   5. Realtime pings (content-free events; clients re-fetch through the normal RPCs)
--   6. Cursor paging with a tie-breaker (created_at, id)
-- Run after 0005_remove_age_gate.sql.

-- Helpers --------------------------------------------------------------------------------------
create or replace function public.muted_words_valid(p_words text[])
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select cardinality(p_words) <= 30
    and not exists (
      select 1 from unnest(p_words) w where w is null or char_length(w) not between 1 and 40
    );
$$;

-- True when the text contains one of the words (whole word, case-insensitive).
-- Regex characters in the words are escaped, so a muted word can never act as a pattern.
create or replace function public.word_muted(p_body text, p_words text[])
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from unnest(p_words) w
    where p_body ~* ('\m' || regexp_replace(w, '([\\^$.|?*+()\[\]{}])', '\\\1', 'g') || '\M')
  );
$$;

-- 1. Anonymous posts ---------------------------------------------------------------------------
alter table public.posts add column is_anonymous boolean not null default false;
-- Anonymous posts are public only: on a mutuals-only post the audience is so small the author is easy to guess.
alter table public.posts
  add constraint posts_anonymous_public check (not is_anonymous or visibility = 'public');
grant insert (is_anonymous) on public.posts to authenticated;

drop policy posts_select on public.posts;
drop function public.post_visible(uuid, text);

-- Anonymous posts ignore blocks on purpose. If a block hid them, a user could block a suspect
-- and watch whether the post disappears (same attack as with anonymous replies).
create or replace function public.post_visible(p_author uuid, p_visibility text, p_anonymous boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
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

-- Direct table reads never return anonymous posts of other people (they would expose author_id).
-- Everyone reads those through get_post() / list_posts(), which blank the author.
create policy posts_select on public.posts
  for select to authenticated
  using (
    author_id = (select auth.uid())
    or (not is_anonymous and public.post_visible(author_id, visibility, false))
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
    where p.id = p_post_id and public.post_visible(p.author_id, p.visibility, p.is_anonymous)
  );
$$;

-- 2. Muted words (private, own row only) -------------------------------------------------------
alter table public.profile_private
  add column muted_words text[] not null default '{}',
  add constraint profile_private_muted_valid check (public.muted_words_valid(muted_words));
grant update (muted_words) on public.profile_private to authenticated;

-- 3. Reports remember what kind of thing was reported -------------------------------------------
alter table public.reports add column target_kind text;
update public.reports set target_kind = case when reply_id is not null then 'reply' else 'post' end;
alter table public.reports add constraint reports_target_kind_valid check (target_kind in ('post', 'reply'));

create or replace function public.reports_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.reply_id is not null then
    new.target_kind := 'reply';
    select r.author_id, r.body, r.post_id
    into new.target_author_id, new.target_body, new.post_id
    from public.replies r
    where r.id = new.reply_id;
  elsif new.post_id is not null then
    new.target_kind := 'post';
    select p.author_id, p.body
    into new.target_author_id, new.target_body
    from public.posts p
    where p.id = new.post_id;
  end if;
  return new;
end;
$$;

-- 4. Reading posts and replies -------------------------------------------------------------------
-- One post, with the author blanked for anonymous posts.
create or replace function public.get_post(p_post_id uuid)
returns table (
  id uuid,
  author_id uuid,
  body text,
  visibility text,
  is_anonymous boolean,
  created_at timestamptz,
  updated_at timestamptz,
  author_username text,
  author_display_name text,
  is_mine boolean,
  reply_count bigint
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
    p.created_at,
    p.updated_at,
    case when p.is_anonymous then null else pr.username end,
    case when p.is_anonymous then null else pr.display_name end,
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
    )
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  where p.id = p_post_id
    and public.post_visible(p.author_id, p.visibility, p.is_anonymous);
$$;

-- Replies: anonymous ones ignore blocks; non-anonymous ones from blocked users are hidden;
-- muted words hide other people's replies from you.
create or replace function public.get_replies(p_post_id uuid)
returns table (
  id uuid,
  post_id uuid,
  body text,
  is_anonymous boolean,
  created_at timestamptz,
  author_id uuid,
  username text,
  display_name text,
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
    where p.id = p_post_id and public.post_visible(p.author_id, p.visibility, p.is_anonymous)
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
    case when r.is_anonymous then null else pr.display_name end,
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

-- Feed and profile pages in one call. (created_at, id) is the paging cursor.
drop function public.list_posts(uuid, boolean, timestamptz, integer);
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
  created_at timestamptz,
  updated_at timestamptz,
  author_username text,
  author_display_name text,
  is_mine boolean,
  reply_count bigint
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
      and public.post_visible(p.author_id, p.visibility, p.is_anonymous)
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
    page.created_at,
    page.updated_at,
    case when page.is_anonymous then null else pr.username end,
    case when page.is_anonymous then null else pr.display_name end,
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
    )
  from page
  join public.profiles pr on pr.id = page.author_id
  order by page.created_at desc, page.id desc;
$$;

-- 5. Notifications ---------------------------------------------------------------------------
-- Rows hold only ids. Who replied is looked up when you read them, and only for non-anonymous
-- replies, so a notification can never reveal an anonymous replier. Deleting the reply deletes
-- the notification (cascade). Blocks hide notifications from non-anonymous replies, like replies.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  reply_id uuid not null references public.replies (id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;

create or replace function public.on_reply_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
begin
  select p.author_id into v_owner from public.posts p where p.id = new.post_id;

  if v_owner is not null and v_owner <> new.author_id then
    insert into public.notifications (user_id, post_id, reply_id) values (v_owner, new.post_id, new.id);
  end if;

  -- Realtime pings carry no content: clients just re-read through the normal functions.
  -- Never let a realtime problem block a reply.
  begin
    perform realtime.send('{}'::jsonb, 'reply', 'post:' || new.post_id::text, true);
    if v_owner is not null and v_owner <> new.author_id then
      perform realtime.send('{}'::jsonb, 'notify', 'user:' || v_owner::text, true);
    end if;
  exception when others then
    null;
  end;

  return new;
end;
$$;

create trigger replies_after_insert
  after insert on public.replies
  for each row execute function public.on_reply_created();

create or replace function public.get_notifications(p_limit integer default 50)
returns table (
  id uuid,
  post_id uuid,
  reply_id uuid,
  created_at timestamptz,
  is_read boolean,
  is_anonymous boolean,
  actor_username text,
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

create or replace function public.unread_notification_count()
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)
  from public.notifications n
  join public.replies r on r.id = n.reply_id
  where n.user_id = auth.uid()
    and n.read_at is null
    and (
      r.is_anonymous
      or not exists (
        select 1 from public.blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = r.author_id)
           or (b.blocker_id = r.author_id and b.blocked_id = auth.uid())
      )
    );
$$;

create or replace function public.mark_notifications_read()
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;

-- 6. Admin moderation --------------------------------------------------------------------------
-- Admins are rows in public.admins (add yourself once from the SQL Editor, see README).
-- Admins can see who wrote an anonymous post or reply that was reported. That is the one
-- exception to anonymity, and it is only reachable through these functions.
create table public.admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.admin_list_reports(
  p_status text default 'open',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  status text,
  reason text,
  created_at timestamptz,
  reporter_username text,
  target_kind text,
  target_exists boolean,
  target_body text,
  target_author_id uuid,
  target_username text,
  target_is_anonymous boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return query
  select
    rp.id,
    rp.status,
    rp.reason,
    rp.created_at,
    reporter.username,
    rp.target_kind,
    case when rp.target_kind = 'reply' then rp.reply_id is not null else rp.post_id is not null end,
    rp.target_body,
    rp.target_author_id,
    target.username,
    case
      when rp.target_kind = 'reply' then (select r.is_anonymous from public.replies r where r.id = rp.reply_id)
      else (select p.is_anonymous from public.posts p where p.id = rp.post_id)
    end
  from public.reports rp
  left join public.profiles reporter on reporter.id = rp.reporter_id
  left join public.profiles target on target.id = rp.target_author_id
  where p_status is null or rp.status = p_status
  order by rp.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.admin_set_report_status(p_report_id uuid, p_status text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_status not in ('open', 'reviewed', 'dismissed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  update public.reports set status = p_status where id = p_report_id;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

-- Deletes the reported post or reply (a post takes its replies with it) and marks the report reviewed.
-- The report keeps its snapshot, so the evidence stays.
create or replace function public.admin_remove_target(p_report_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind text;
  v_post uuid;
  v_reply uuid;
  v_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  select rp.target_kind, rp.post_id, rp.reply_id into v_kind, v_post, v_reply
  from public.reports rp where rp.id = p_report_id;
  if not found then
    return false;
  end if;

  if v_kind = 'reply' and v_reply is not null then
    delete from public.replies where id = v_reply;
    get diagnostics v_count = row_count;
  elsif v_kind = 'post' and v_post is not null then
    delete from public.posts where id = v_post;
    get diagnostics v_count = row_count;
  end if;

  update public.reports set status = 'reviewed' where id = p_report_id;
  return v_count > 0;
end;
$$;

-- 7. Realtime: who may listen to which channel ---------------------------------------------------
-- Channels: post:<id> (someone replied) and user:<id> (you have a new notification).
-- Only runs on Supabase (the realtime schema does not exist in the local test database).
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists cleofas_realtime_receive on realtime.messages';
    execute $policy$
      create policy cleofas_realtime_receive on realtime.messages
        for select to authenticated
        using (
          realtime.messages.extension = 'broadcast'
          and case
            when (select realtime.topic()) ~ '^post:[0-9a-f-]{36}$'
              then public.can_view_post(substring((select realtime.topic()) from 6)::uuid)
            when (select realtime.topic()) ~ '^user:[0-9a-f-]{36}$'
              then substring((select realtime.topic()) from 6) = (select auth.uid())::text
            else false
          end
        )
    $policy$;
  end if;
end;
$$;

-- 8. Grants --------------------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_mutual(uuid, uuid),
  public.is_blocked(uuid, uuid),
  public.post_visible(uuid, text, boolean),
  public.can_view_post(uuid),
  public.can_view_reply(uuid),
  public.get_post(uuid),
  public.get_replies(uuid),
  public.delete_reply(uuid),
  public.list_posts(uuid, boolean, timestamptz, integer, uuid),
  public.search_profiles(text),
  public.complete_onboarding(text, text, text),
  public.delete_my_account(),
  public.get_notifications(integer),
  public.unread_notification_count(),
  public.mark_notifications_read(),
  public.muted_words_valid(text[]),
  public.is_admin(),
  public.admin_list_reports(text, integer, integer),
  public.admin_set_report_status(uuid, text),
  public.admin_remove_target(uuid)
  to authenticated;
