-- Cleofas: helper functions, RPCs and triggers (PROJECT.md sections 3, 5 and 6)
--
-- All helpers run with elevated rights (security definer) so RLS policies can call
-- them without recursion. Each one only answers questions about the *caller*
-- (auth.uid()), so clients cannot use them to probe other people's follows/blocks.

-- Helper logic -------------------------------------------------------------

create or replace function public.is_mutual(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and auth.uid() in (a, b)
    and a <> b
    and exists (select 1 from public.follows where follower_id = a and following_id = b)
    and exists (select 1 from public.follows where follower_id = b and following_id = a);
$$;

-- true when EITHER user has blocked the other
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and auth.uid() in (a, b)
    and exists (
      select 1 from public.blocks
      where (blocker_id = a and blocked_id = b)
         or (blocker_id = b and blocked_id = a)
    );
$$;

-- Post visibility rule (section 6): author, OR (public AND not blocked),
-- OR (mutuals AND mutual AND not blocked).
create or replace function public.post_visible(p_author uuid, p_visibility text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
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

create or replace function public.can_view_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_post_id
      and public.post_visible(p.author_id, p.visibility)
  );
$$;

-- A reply is visible if its post is visible and the replier is not blocked
-- (blocking applies to anonymous replies too, using the hidden author_id).
create or replace function public.can_view_reply(p_reply_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.replies r
    where r.id = p_reply_id
      and public.can_view_post(r.post_id)
      and (r.author_id = auth.uid() or not public.is_blocked(auth.uid(), r.author_id))
  );
$$;

-- Reply RPCs ---------------------------------------------------------------

-- The ONLY way clients read replies. author_id / username are null for
-- anonymous replies, so the replier's identity never leaves the database.
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
set search_path = public
as $$
  select
    r.id,
    r.post_id,
    r.body,
    r.is_anonymous,
    r.created_at,
    case when r.is_anonymous then null else r.author_id end,
    case when r.is_anonymous then null else pr.username end,
    case when r.is_anonymous then null else pr.display_name end,
    (r.author_id = auth.uid()) as is_mine,
    (r.author_id = auth.uid() or p.author_id = auth.uid()) as can_delete
  from public.replies r
  join public.posts p on p.id = r.post_id
  join public.profiles pr on pr.id = r.author_id
  where r.post_id = p_post_id
    and public.can_view_post(p_post_id)
    and (r.author_id = auth.uid() or not public.is_blocked(auth.uid(), r.author_id))
  order by r.created_at asc;
$$;

create or replace function public.reply_counts(p_post_ids uuid[])
returns table (post_id uuid, reply_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select r.post_id, count(*)
  from public.replies r
  where r.post_id = any (p_post_ids)
    and public.can_view_post(r.post_id)
    and (r.author_id = auth.uid() or not public.is_blocked(auth.uid(), r.author_id))
  group by r.post_id;
$$;

-- Reply author OR post author may delete (section 6).
create or replace function public.delete_reply(p_reply_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.replies r
  using public.posts p
  where r.id = p_reply_id
    and p.id = r.post_id
    and (r.author_id = auth.uid() or p.author_id = auth.uid());
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

-- Triggers -----------------------------------------------------------------

-- New auth user -> profile with a temporary username (user_xxxxxxxx).
-- The app sends people with a temporary username to /onboarding.
-- Display name is deliberately NOT copied from Google: rants should not
-- accidentally carry someone's real name.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, 'user_' || substr(replace(new.id::text, '-', ''), 1, 8));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- Rate limiting (section 3.6). Usage: enforce_rate_limit(<user column>, <max rows>, <window>)
-- Limits are intentionally small for an MVP; tune them here.
create or replace function public.enforce_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
  v_count bigint;
begin
  execute format(
    'select count(*) from %I.%I where %I = $1 and created_at > now() - $2::interval',
    tg_table_schema, tg_table_name, tg_argv[0]
  ) into v_count using v_user, tg_argv[2];

  if v_count >= tg_argv[1]::bigint then
    raise exception 'rate_limit_exceeded' using
      errcode = 'P0001',
      detail = tg_table_name,
      hint = 'Too many actions in a short time. Please slow down.';
  end if;

  return new;
end;
$$;

create trigger posts_rate_limit
  before insert on public.posts
  for each row execute function public.enforce_rate_limit('author_id', '5', '10 minutes');

create trigger replies_rate_limit
  before insert on public.replies
  for each row execute function public.enforce_rate_limit('author_id', '15', '10 minutes');

create trigger reports_rate_limit
  before insert on public.reports
  for each row execute function public.enforce_rate_limit('reporter_id', '10', '1 hour');

create trigger follows_rate_limit
  before insert on public.follows
  for each row execute function public.enforce_rate_limit('follower_id', '60', '1 hour');

-- Blocking removes any follow between the two users, in both directions.
create or replace function public.on_block_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and following_id = new.blocked_id)
     or (follower_id = new.blocked_id and following_id = new.blocker_id);
  return new;
end;
$$;

create trigger blocks_remove_follows
  after insert on public.blocks
  for each row execute function public.on_block_created();
