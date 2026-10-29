-- Cleofas 0005: remove the stored age gate (added in 0004).
-- Run after 0004. The age requirement is now only a notice on the login page (13+).

-- Policies first (they call age_ok()), then the functions, then the columns.
drop policy posts_insert_own on public.posts;
create policy posts_insert_own on public.posts
  for insert to authenticated
  with check (author_id = (select auth.uid()));

drop policy posts_update_own on public.posts;
create policy posts_update_own on public.posts
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

drop policy replies_insert_own on public.replies;
create policy replies_insert_own on public.replies
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_view_post(post_id));

drop policy follows_insert_own on public.follows;
create policy follows_insert_own on public.follows
  for insert to authenticated
  with check (
    follower_id = (select auth.uid())
    and not public.is_blocked((select auth.uid()), following_id)
  );

drop policy reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and (post_id is null or public.can_view_post(post_id))
    and (reply_id is null or public.can_view_reply(reply_id))
  );

create or replace function public.post_visible(p_author uuid, p_visibility text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
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

create or replace function public.search_profiles(p_term text)
returns table (id uuid, username text, display_name text)
language sql
stable
set search_path = public, pg_temp
as $$
  select p.id, p.username, p.display_name
  from public.profiles p
  where p_term ~ '^[a-z0-9_]{2,20}$'
    and p.username like replace(p_term, '_', '\_') || '%'
    and p.id <> auth.uid()
    and not public.is_blocked(auth.uid(), p.id)
  order by p.username collate "C"
  limit 20;
$$;

-- Onboarding now only sets the profile (no age parameter).
drop function public.complete_onboarding(text, text, text, integer);
create or replace function public.complete_onboarding(
  p_username text,
  p_display_name text,
  p_bio text
)
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
      display_name = nullif(btrim(p_display_name), ''),
      bio = nullif(btrim(p_bio), '')
  where id = auth.uid();
end;
$$;

drop function public.age_ok();
alter table public.profile_private drop column age_confirmed_at;
alter table public.profile_private drop column age_confirmed_min;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_mutual(uuid, uuid),
  public.is_blocked(uuid, uuid),
  public.post_visible(uuid, text),
  public.can_view_post(uuid),
  public.can_view_reply(uuid),
  public.get_replies(uuid),
  public.delete_reply(uuid),
  public.list_posts(uuid, boolean, timestamptz, integer),
  public.search_profiles(text),
  public.complete_onboarding(text, text, text),
  public.delete_my_account()
  to authenticated;
