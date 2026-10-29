-- Cleofas 0004: hardening (anonymity, age gate, private settings, report evidence, efficiency)
-- Run after 0003_rls.sql. Safe to run on a database that already has data.
--
-- What changes:
--   1. Anonymous replies are NEVER hidden because of a block (blocking used to
--      reveal who wrote an anonymous reply: block a suspect, see if the reply vanishes).
--      Blocks now only hide NON-anonymous replies.
--   2. profile_private: default_anonymous_replies (was readable by everyone) + the
--      stored age confirmation. Own row only.
--   3. Age gate enforced in the database: no read/write of content until the age is confirmed.
--   4. Reports keep a snapshot of the reported content + its real author, so evidence
--      survives deletion, and reporters can never read target_author_id.
--   5. One-query RPCs (list_posts, search_profiles) instead of N+1 / 3 round trips.
--   6. Rate limit on blocks, reserved usernames, account deletion, search_path hardening.

-- 0. search_path hardening: pg_temp last, so temp objects cannot shadow ours ---------------
alter function public.is_mutual(uuid, uuid) set search_path = public, pg_temp;
alter function public.is_blocked(uuid, uuid) set search_path = public, pg_temp;
alter function public.can_view_post(uuid) set search_path = public, pg_temp;
alter function public.delete_reply(uuid) set search_path = public, pg_temp;
alter function public.enforce_rate_limit() set search_path = public, pg_temp;
alter function public.on_block_created() set search_path = public, pg_temp;

-- 1. profile_private ------------------------------------------------------------------------
create table public.profile_private (
  id uuid primary key references public.profiles (id) on delete cascade,
  default_anonymous_replies boolean not null default false,
  -- Self-declared age confirmation. NULL = not confirmed yet = no access to content.
  age_confirmed_at timestamptz,
  age_confirmed_min smallint,
  constraint profile_private_age_pair check ((age_confirmed_at is null) = (age_confirmed_min is null)),
  constraint profile_private_age_min check (age_confirmed_min is null or age_confirmed_min >= 13)
);

insert into public.profile_private (id, default_anonymous_replies)
select id, default_anonymous_replies from public.profiles;

-- Existing users have age_confirmed_at = NULL on purpose: the old checkbox was never stored,
-- so the app sends them through /onboarding once to confirm again.
alter table public.profiles drop column default_anonymous_replies;

alter table public.profile_private enable row level security;
revoke all on public.profile_private from anon, authenticated;
grant select on public.profile_private to authenticated;
grant update (default_anonymous_replies) on public.profile_private to authenticated;

create policy profile_private_select_own on public.profile_private
  for select to authenticated
  using (id = (select auth.uid()));

create policy profile_private_update_own on public.profile_private
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, 'user_' || substr(replace(new.id::text, '-', ''), 1, 8));
  insert into public.profile_private (id) values (new.id);
  return new;
end;
$$;

-- 2. Age gate -------------------------------------------------------------------------------
create or replace function public.age_ok()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profile_private
    where id = auth.uid() and age_confirmed_at is not null
  );
$$;

-- Every read of posts/replies goes through post_visible(), so gating it here
-- gates everything. (Policies below also gate the writes explicitly.)
create or replace function public.post_visible(p_author uuid, p_visibility text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and public.age_ok()
    and (
      p_author = auth.uid()
      or (
        not public.is_blocked(auth.uid(), p_author)
        and (
          p_visibility = 'public'
          or (p_visibility = 'mutuals' and public.is_mutual(auth.uid(), p_author))
        )
      )
    );
$$;

-- The only way to set the age confirmation (together with the username, in one step).
-- p_min_age is the threshold the app showed; the database refuses anything under 13.
create or replace function public.complete_onboarding(
  p_username text,
  p_display_name text,
  p_bio text,
  p_min_age integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_min_age is null or p_min_age < 13 or p_min_age > 120 then
    raise exception 'invalid_min_age' using errcode = '22023';
  end if;

  update public.profiles
  set username = p_username,
      display_name = nullif(btrim(p_display_name), ''),
      bio = nullif(btrim(p_bio), '')
  where id = v_uid;

  update public.profile_private
  set age_confirmed_at = now(),
      age_confirmed_min = greatest(coalesce(age_confirmed_min, 0), p_min_age)
  where id = v_uid;
end;
$$;

-- 3. Anonymous replies: blocks no longer hide them ------------------------------------------
-- A reply is visible if its post is visible and (it is anonymous, or it is yours, or the
-- replier is not blocked either way). Anonymous replies ignore blocks on purpose.
create or replace function public.can_view_reply(p_reply_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.replies r
    where r.id = p_reply_id
      and public.can_view_post(r.post_id)
      and (
        r.is_anonymous
        or r.author_id = auth.uid()
        or not public.is_blocked(auth.uid(), r.author_id)
      )
  );
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
    where p.id = p_post_id and public.post_visible(p.author_id, p.visibility)
  ),
  hidden as (
    select blocked_id as other from public.blocks where blocker_id = (select uid from me)
    union
    select blocker_id from public.blocks where blocked_id = (select uid from me)
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
  where r.is_anonymous
     or r.author_id = (select uid from me)
     or r.author_id not in (select other from hidden)
  order by r.created_at asc, r.id asc
  limit 500;
$$;

-- Replaced by the reply_count column of list_posts().
drop function if exists public.reply_counts(uuid[]);

-- One round trip for feed + profile pages: posts, author and visible reply count.
-- Runs as definer (it must count other people's replies) but applies post_visible() itself.
create or replace function public.list_posts(
  p_author uuid default null,
  p_following_only boolean default false,
  p_before timestamptz default null,
  p_limit integer default 21
)
returns table (
  id uuid,
  author_id uuid,
  body text,
  visibility text,
  created_at timestamptz,
  updated_at timestamptz,
  author_username text,
  author_display_name text,
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
  page as (
    select p.*
    from public.posts p
    where (p_author is null or p.author_id = p_author)
      and (p_before is null or p.created_at < p_before)
      and (
        not p_following_only
        or p.author_id = (select uid from me)
        or exists (
          select 1 from public.follows f
          where f.follower_id = (select uid from me) and f.following_id = p.author_id
        )
      )
      and public.post_visible(p.author_id, p.visibility)
    order by p.created_at desc, p.id desc
    limit least(greatest(coalesce(p_limit, 21), 1), 51)
  )
  select
    page.id,
    page.author_id,
    page.body,
    page.visibility,
    page.created_at,
    page.updated_at,
    pr.username,
    pr.display_name,
    (
      select count(*)
      from public.replies r
      where r.post_id = page.id
        and (
          r.is_anonymous
          or r.author_id = (select uid from me)
          or r.author_id not in (select other from hidden)
        )
    )
  from page
  join public.profiles pr on pr.id = page.author_id
  order by page.created_at desc, page.id desc;
$$;

-- 4. Search in one query (was one is_blocked() call per result) -----------------------------
create index profiles_username_prefix_idx on public.profiles (username text_pattern_ops);

create or replace function public.search_profiles(p_term text)
returns table (id uuid, username text, display_name text)
language sql
stable
set search_path = public, pg_temp
as $$
  select p.id, p.username, p.display_name
  from public.profiles p
  where p_term ~ '^[a-z0-9_]{2,20}$'
    and public.age_ok()
    and p.username like replace(p_term, '_', '\_') || '%'
    and p.id <> auth.uid()
    and not public.is_blocked(auth.uid(), p.id)
  order by p.username collate "C"
  limit 20;
$$;

-- 5. Reports: keep evidence, hide the real author from reporters, block duplicates ----------
delete from public.reports a
using public.reports b
where a.ctid > b.ctid
  and a.reporter_id = b.reporter_id
  and a.post_id is not distinct from b.post_id
  and a.reply_id is not distinct from b.reply_id;

alter table public.reports add column target_author_id uuid references public.profiles (id) on delete set null;
alter table public.reports add column target_body text;

alter table public.reports drop constraint reports_target_present;
alter table public.reports drop constraint reports_post_id_fkey;
alter table public.reports drop constraint reports_reply_id_fkey;
alter table public.reports
  add constraint reports_post_id_fkey foreign key (post_id) references public.posts (id) on delete set null;
alter table public.reports
  add constraint reports_reply_id_fkey foreign key (reply_id) references public.replies (id) on delete set null;
alter table public.reports
  add constraint reports_target_present check (post_id is not null or reply_id is not null or target_body is not null);

-- Fill the snapshot for reports that already exist.
update public.reports rp set target_author_id = r.author_id, target_body = r.body
from public.replies r where rp.reply_id = r.id;
update public.reports rp set target_author_id = p.author_id, target_body = p.body
from public.posts p where rp.reply_id is null and rp.post_id = p.id;

create unique index reports_unique_post on public.reports (reporter_id, post_id)
  where reply_id is null and post_id is not null;
create unique index reports_unique_reply on public.reports (reporter_id, reply_id)
  where reply_id is not null;

create or replace function public.reports_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.reply_id is not null then
    select r.author_id, r.body, r.post_id
    into new.target_author_id, new.target_body, new.post_id
    from public.replies r
    where r.id = new.reply_id;
  elsif new.post_id is not null then
    select p.author_id, p.body
    into new.target_author_id, new.target_body
    from public.posts p
    where p.id = new.post_id;
  end if;
  return new;
end;
$$;

create trigger reports_snapshot_trg
  before insert on public.reports
  for each row execute function public.reports_snapshot();

-- Reporters may read their own reports, but never the snapshot columns:
-- target_author_id would unmask anonymous repliers.
revoke select on public.reports from authenticated;
grant select (id, reporter_id, post_id, reply_id, reason, status, created_at) on public.reports to authenticated;

-- 6. Policies: age gate on writes -----------------------------------------------------------
drop policy posts_insert_own on public.posts;
create policy posts_insert_own on public.posts
  for insert to authenticated
  with check (author_id = (select auth.uid()) and (select public.age_ok()));

drop policy posts_update_own on public.posts;
create policy posts_update_own on public.posts
  for update to authenticated
  using (author_id = (select auth.uid()) and (select public.age_ok()))
  with check (author_id = (select auth.uid()));

drop policy replies_insert_own on public.replies;
create policy replies_insert_own on public.replies
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (select public.age_ok())
    and public.can_view_post(post_id)
  );

drop policy follows_insert_own on public.follows;
create policy follows_insert_own on public.follows
  for insert to authenticated
  with check (
    follower_id = (select auth.uid())
    and (select public.age_ok())
    and not public.is_blocked((select auth.uid()), following_id)
  );

drop policy reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and (select public.age_ok())
    and (post_id is null or public.can_view_post(post_id))
    and (reply_id is null or public.can_view_reply(reply_id))
  );

-- 7. Rate limit on blocks (block/unblock spam) ---------------------------------------------
create trigger blocks_rate_limit
  before insert on public.blocks
  for each row execute function public.enforce_rate_limit('blocker_id', '30', '1 hour');

-- 8. Reserved usernames (impersonation). NOT VALID: only new/changed rows are checked. ------
alter table public.profiles
  add constraint profiles_username_reserved
  check (username !~ '^(admin|administrator|mod|moderator|support|staff|cleofas|official|system|root|help|anonymous|deleted)$')
  not valid;

-- 9. Delete my account (privacy): cascades to profile, posts, replies, follows, blocks ------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- 10. Grants: functions are closed by default, then opened one by one ----------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_mutual(uuid, uuid),
  public.is_blocked(uuid, uuid),
  public.age_ok(),
  public.post_visible(uuid, text),
  public.can_view_post(uuid),
  public.can_view_reply(uuid),
  public.get_replies(uuid),
  public.delete_reply(uuid),
  public.list_posts(uuid, boolean, timestamptz, integer),
  public.search_profiles(text),
  public.complete_onboarding(text, text, text, integer),
  public.delete_my_account()
  to authenticated;

-- New tables/functions created later should not be open to anon/authenticated by default.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
