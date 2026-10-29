-- Cleofas: Row Level Security + least-privilege grants (README.md section 6)
-- Privacy is enforced here, in the database. The frontend is not trusted.

alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.blocks enable row level security;
alter table public.posts enable row level security;
alter table public.replies enable row level security;
alter table public.reports enable row level security;

-- Start from zero. Anonymous visitors get no table access at all.
revoke all on all tables in schema public from anon, authenticated;

-- Functions: only signed-in users may call the helpers / RPCs.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_mutual(uuid, uuid),
  public.is_blocked(uuid, uuid),
  public.post_visible(uuid, text),
  public.can_view_post(uuid),
  public.can_view_reply(uuid),
  public.get_replies(uuid),
  public.reply_counts(uuid[]),
  public.delete_reply(uuid)
  to authenticated;

-- profiles -----------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (username, display_name, bio, default_anonymous_replies) on public.profiles to authenticated;

create policy profiles_select on public.profiles
  for select to authenticated
  using (true);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- follows ------------------------------------------------------------------
grant select, delete on public.follows to authenticated;
grant insert (follower_id, following_id) on public.follows to authenticated;

-- Follow lists are visible, except rows involving someone who blocked you (or you blocked).
create policy follows_select on public.follows
  for select to authenticated
  using (
    (select auth.uid()) in (follower_id, following_id)
    or (not public.is_blocked((select auth.uid()), follower_id)
        and not public.is_blocked((select auth.uid()), following_id))
  );

create policy follows_insert_own on public.follows
  for insert to authenticated
  with check (
    follower_id = (select auth.uid())
    and not public.is_blocked((select auth.uid()), following_id)
  );

create policy follows_delete_own on public.follows
  for delete to authenticated
  using (follower_id = (select auth.uid()));

-- blocks -------------------------------------------------------------------
grant select, delete on public.blocks to authenticated;
grant insert (blocker_id, blocked_id) on public.blocks to authenticated;

-- You can only see blocks you made. (Whether someone blocked you is never listed.)
create policy blocks_select_own on public.blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy blocks_insert_own on public.blocks
  for insert to authenticated
  with check (blocker_id = (select auth.uid()));

create policy blocks_delete_own on public.blocks
  for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- posts --------------------------------------------------------------------
grant select, delete on public.posts to authenticated;
grant insert (author_id, body, visibility) on public.posts to authenticated;
grant update (body, visibility) on public.posts to authenticated;

create policy posts_select on public.posts
  for select to authenticated
  using (public.post_visible(author_id, visibility));

create policy posts_insert_own on public.posts
  for insert to authenticated
  with check (author_id = (select auth.uid()));

create policy posts_update_own on public.posts
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy posts_delete_own on public.posts
  for delete to authenticated
  using (author_id = (select auth.uid()));

-- replies ------------------------------------------------------------------
-- Clients can only SELECT their own raw rows. Everyone else's replies come from
-- get_replies(), which hides author_id for anonymous replies.
-- Deleting as the *post author* goes through delete_reply() for the same reason.
grant select, delete on public.replies to authenticated;
grant insert (post_id, author_id, body, is_anonymous) on public.replies to authenticated;
grant update (body) on public.replies to authenticated;

create policy replies_select_own on public.replies
  for select to authenticated
  using (author_id = (select auth.uid()));

create policy replies_insert_own on public.replies
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.can_view_post(post_id)
  );

create policy replies_update_own on public.replies
  for update to authenticated
  using (author_id = (select auth.uid()) and public.can_view_post(post_id))
  with check (author_id = (select auth.uid()));

create policy replies_delete_own on public.replies
  for delete to authenticated
  using (author_id = (select auth.uid()));

-- reports ------------------------------------------------------------------
-- status stays at its default ('open'): clients cannot set it. Moderators use the
-- service role / dashboard (admin review is handled separately).
grant select on public.reports to authenticated;
grant insert (reporter_id, post_id, reply_id, reason) on public.reports to authenticated;

create policy reports_select_own on public.reports
  for select to authenticated
  using (reporter_id = (select auth.uid()));

create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and (post_id is null or public.can_view_post(post_id))
    and (reply_id is null or public.can_view_reply(reply_id))
  );
