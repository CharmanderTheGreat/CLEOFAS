# Cleofas

A web app for rants. Each post is **public** or **mutuals-only**, and replies follow the same rule. Replies can be shown with a username or anonymously. Full plan: see [README.md](./README.md).

Stack: Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + Supabase (Postgres, Auth, RLS).

## What is built (Phase 0 + most of Phase 1)

- Google sign-in, onboarding (username), 13+ notice on the login page, settings (profile, default anonymous replies, blocked list, delete account)
- Posts with visibility picker, edit/delete, feed (Everyone / Following, "Older posts" paging)
- Post page with replies (username or anonymous), edit/delete own, post author can delete any reply
- Follow/unfollow, "Mutual" badge, followers/following lists, find people
- Block (hides both ways, removes follows), report post/reply (reports keep a snapshot of the content for moderators)
- Rate limits (in the database, also on blocks), crisis resources page + links in footer and composer
- All privacy rules live in Postgres RLS (`supabase/migrations`), tested with `npm run test:rls`

Not built yet (Phase 2+): realtime replies, notifications, PWA, admin moderation page, muted words, vent mode, reactions.

## Setup

### 1. Supabase project
1. Create a free project at <https://supabase.com>.
2. Open **SQL Editor** and run these files **in order** (paste each one and run):
   1. `supabase/migrations/0001_schema.sql`
   2. `supabase/migrations/0002_functions.sql`
   3. `supabase/migrations/0003_rls.sql`
   4. `supabase/migrations/0004_hardening.sql`
   5. `supabase/migrations/0005_remove_age_gate.sql`

   Already ran 0001-0003? Run only 0004 then 0005.

   (Or with the Supabase CLI: `supabase link` then `supabase db push`.)

### 2. Google sign-in
1. Google Cloud Console -> **APIs & Services** -> **Credentials** -> **Create OAuth client ID** (type: Web application).
2. Add this as an **Authorized redirect URI**: `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`
3. In Supabase: **Authentication** -> **Providers** -> **Google** -> enable, paste the Client ID and Secret.
4. In Supabase: **Authentication** -> **URL Configuration**:
   - Site URL: `http://localhost:3000` (change to your Vercel URL later)
   - Redirect URLs: add `http://localhost:3000/auth/callback` and `https://YOUR-APP.vercel.app/auth/callback`

### 3. Run locally
```bash
cp .env.example .env.local     # then fill in the Project URL + anon key (Settings -> API)
npm install
npm run dev                    # http://localhost:3000
```

### 4. Deploy to Vercel
Import the repo, add the same two environment variables, deploy. Then add the Vercel URL to the Supabase redirect URLs (step 2.4).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript check |
| `npm run test:rls` | Runs the README.md section 10 checklist (plus extra cases, 31 tests) against the migrations in an in-memory Postgres. No Supabase account needed. |

## How privacy is enforced

- Every table has RLS on, and the `anon` role has no table access.
- `posts` are readable only through `post_visible()` (author, public, or mutual, never when blocked).
- Raw `replies` rows are readable only by their own author. Everyone else reads replies through `get_replies()`, which returns `author_id`/`username` as `null` for anonymous replies. The app never queries other people's rows from `replies` directly.
- Blocks hide only NON-anonymous replies. Anonymous replies are never hidden by a block, otherwise blocking a suspect would reveal who wrote them.
- On mutuals-only posts only mutuals can reply, so anonymous replies are easier to guess. The reply form says so.
- Private settings (`default_anonymous_replies`) live in `profile_private`, readable only by their owner.
- Reports store `target_author_id` and `target_body` for moderators. Reporters cannot read those columns.
- Feed, profile posts and search each use one RPC (`list_posts`, `search_profiles`), so visibility is applied in one place.
- Rate limits are triggers on `posts`, `replies`, `reports`, `follows` and `blocks` (edit the numbers in `0002_functions.sql`).

## Before a public launch

- [ ] Re-verify the crisis hotline numbers in `lib/constants.ts`
- [ ] Write Terms of Service and a Privacy Policy
- [ ] Decide the age notice (`MIN_AGE` in `lib/constants.ts`: 13 or 18). It is only text, not verified
- [ ] Delete account uses `delete from auth.users` inside a database function. Test it once on your Supabase project
- [ ] Decide who moderates (reports are in the `reports` table; review them in the Supabase dashboard for now)
- [ ] Supabase free projects pause after about a week of inactivity. Vercel Hobby is non-commercial only.
