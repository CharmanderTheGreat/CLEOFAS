# Cleofas

A web app where people can post rants, and others can reply depending on the post's privacy setting (public or friends/mutuals).

Status: Planning -> MVP
Platform: Web app (PWA-ready), free tier stack

---

## 1. Goals

- Give people a safe place to rant, with control over who can see and reply.
- Keep it simple: post, reply, follow. Nothing else at first.
- Zero cost at the start (free tiers only).

## 2. Non-Goals (for the MVP)

- Native mobile app (Play Store / App Store)
- Image and video uploads
- Direct messages
- Algorithmic feed or recommendations
- Monetization

---

## 3. Core Features (MVP)

### 3.1 Auth
- Sign up and log in with Google (Gmail) only, no email + password
- Unique username
- Basic profile (display name, bio)

### 3.2 Posts (Rants)
- Create a text post (max 1000 characters)
- Visibility per post:
  - Public: any logged-in user can see and reply
  - Mutuals: only mutual follows can see and reply
- Edit and delete own posts

### 3.3 Replies
- Who can reply follows the post's visibility:
  - Public post: anyone can reply
  - Friends (mutuals) post: only mutual friends can reply
- Identity setting: a reply can be shown with the replier's username or anonymously, controlled through a settings option
- Edit and delete own replies
- The post author can delete any reply on their post

### 3.4 Follow System
- Follow and unfollow
- Mutual = both users follow each other
- Followers and following lists

### 3.5 Feed
- Home feed: posts from people you follow plus public posts (chronological first)
- Profile page: a user's posts, filtered by the visibility rules

### 3.6 Safety (part of the MVP, not optional)
- Report a post or reply
- Block a user (hidden from each other, cannot reply)
- Rate limiting on posts and replies
- Crisis resources link on the footer and compose page
- Basic content filter (slurs, spam) in phase 2 if time is short

---

## 4. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript | Familiar, SSR, easy to deploy |
| Styling | Tailwind CSS | Fast UI work |
| Hosting | Vercel or Cloudflare Pages | Free tier |
| Backend / DB | Supabase (Postgres) | Auth, DB, and realtime in one |
| Auth | Supabase Auth | Built in |
| Realtime | Supabase Realtime | Live replies |
| Privacy enforcement | Postgres Row Level Security (RLS) | Cannot be bypassed from the frontend |

### Free tier limits to remember
- Supabase free projects pause after about a week of inactivity (can be resumed manually)
- Limited database size and bandwidth
- Vercel Hobby plan is for non-commercial use only

---

## 5. Data Model

### profiles
| Field | Notes |
|---|---|
| id | Same as the auth user id |
| username | Unique, 3-20 chars, lowercase letters, numbers, underscore |
| display_name | Optional |
| bio | Max 160 chars |
| created_at | Timestamp |

### follows
| Field | Notes |
|---|---|
| follower_id | The user who follows |
| following_id | The user being followed |
| created_at | Timestamp |

Primary key is the pair (follower_id, following_id). A user cannot follow themselves.

### blocks
| Field | Notes |
|---|---|
| blocker_id | The user who blocks |
| blocked_id | The user being blocked |
| created_at | Timestamp |

Primary key is the pair (blocker_id, blocked_id). A user cannot block themselves.

### posts
| Field | Notes |
|---|---|
| id | Unique id |
| author_id | References profiles |
| body | 1-1000 chars |
| visibility | "public" or "mutuals" (default public) |
| created_at / updated_at | Timestamps |

Indexes: by (author_id, created_at) and by created_at, both descending.

### replies
| Field | Notes |
|---|---|
| id | Unique id |
| post_id | References posts, deleted with the post |
| author_id | References profiles |
| body | 1-500 chars |
| is_anonymous | True if the reply is shown without the replier's identity |
| created_at | Timestamp |

Index: by (post_id, created_at).

Anonymous reply note: author_id is still stored (needed for moderation and blocking) but must never be returned to other users for anonymous replies. Expose replies through a database view or function that hides author_id when is_anonymous is true, and do not let clients query the raw replies table directly.

### reports
| Field | Notes |
|---|---|
| id | Unique id |
| reporter_id | References profiles |
| post_id / reply_id | At least one must be set |
| reason | Required text |
| status | open, reviewed, or dismissed (default open) |
| created_at | Timestamp |

### Helper logic (database functions)
- is_mutual(a, b): true when a follows b and b follows a
- is_blocked(a, b): true when either user has blocked the other
- Both run with elevated rights so RLS policies can call them safely
- A trigger on new auth users auto-creates a profile with a temporary username

---

## 6. Privacy Rules (RLS)

RLS must be enabled on every table. Privacy is enforced in the database, never only in the frontend.

| Action | Rule |
|---|---|
| View post | Author, OR (public AND not blocked), OR (mutuals AND mutual AND not blocked) |
| Create post | Authenticated, and author is the current user |
| Edit / delete post | Author only |
| View reply | Only if the parent post is visible and the replier is not blocked |
| Create reply | Only if the parent post is visible, not blocked, and author is the current user |
| Delete reply | Reply author or post author |
| Follow / unfollow | Own follow rows only |
| Block / unblock | Own block rows only |
| View profiles | Any authenticated user |
| Create report | Authenticated, reporter is the current user |
| View reports | Own reports only (admin review handled separately) |

Notes:
- Reply visibility piggybacks on post visibility: if you cannot see the post, you cannot see or add replies.
- Blocking works in both directions.
- Anonymous replies hide the replier's identity from everyone except moderators. Blocking still applies to anonymous replies (enforced server-side using the hidden author_id).

---

## 7. Suggested Project Structure

- app/: routes (login, signup, feed, post page, profile page, settings)
- components/: PostCard, PostComposer, ReplyList, FollowButton, VisibilityPicker, ReportDialog
- lib/: Supabase client (browser and server) and validators
- supabase/migrations/: SQL migration files for the schema and policies
- public/: PWA manifest and icons
- PROJECT.md: this document

---

## 8. Setup Steps (high level)

1. Create a Supabase project (free tier)
2. Create the tables, helper functions, trigger, and RLS policies from sections 5 and 6 as migration files
3. Enable Realtime on posts and replies
4. Create the Next.js project with TypeScript and Tailwind
5. Add the Supabase client libraries and environment variables (project URL and anon key)
6. Deploy to Vercel and set the same environment variables there

---

## 9. Build Roadmap

### Phase 0 - Setup
- [ ] Supabase project and env vars
- [ ] Schema and RLS
- [ ] Next.js project deployed to Vercel

### Phase 1 - MVP
- [ ] Auth (sign up, log in, log out)
- [ ] Profile and username setup
- [ ] Create post with visibility picker
- [ ] Feed (public + following)
- [ ] Post page with replies
- [ ] Follow / unfollow with mutual indicator
- [ ] Block and report
- [ ] Rate limiting
- [ ] Crisis resources banner
- [ ] RLS testing (public, mutuals, blocked cases)

### Phase 2 - Improve
- [ ] Realtime replies
- [ ] Notifications (reply on your post)
- [ ] PWA install support
- [ ] Anonymous posting option
- [ ] Muted words and filters
- [ ] Admin moderation page for reports
- [ ] Pagination / infinite scroll

### Phase 3 - Later
- [ ] "Vent mode" (posts auto-delete after X days)
- [ ] Reactions (hug, relate, etc.) instead of likes
- [ ] Content warning toggle
- [ ] Email notifications
- [ ] Native wrapper (Capacitor) if really needed

---

## 10. Testing Checklist (RLS)

| Scenario | Expected |
|---|---|
| A posts public, B does not follow A | B can see and reply |
| A posts mutuals, B follows A only (not mutual) | B cannot see |
| A posts mutuals, A and B are mutual | B can see and reply |
| A blocks B, A posts public | B cannot see |
| B blocks A | A cannot see B's posts or reply to them |
| B replies to A's post, A deletes the reply | Success |
| C tries to delete B's reply | Denied |
| Unauthenticated visitor | No access |

---

## 11. Safety and Moderation Notes

- Collect minimal data (email only) and avoid storing anything sensitive that is not needed.
- Rants may include mental health content. Add a crisis resources link (PH hotlines) and verify the numbers before publishing, since they change.
- Write Terms of Service and a Privacy Policy before any public launch.
- Add an age gate (13+ minimum, 18+ is safer if content can get heavy).
- Random or anonymous replies carry abuse risk. Rate limits and a report flow must exist before opening to the public.

---

## 12. Open Questions

- [x] App name: Cleofas
- [x] Replies: both username and anonymous, controlled by a setting
- [x] Who can reply: public post = anyone, friends (mutuals) post = mutual friends only
- [x] Auth: Google (Gmail) sign-in only
- [ ] Target users: schoolmates first (PUP) or open to everyone?
- [ ] Who moderates: just you, or recruit mods?

---

## 13. Notes / Changelog

- 2026-10-23: Initial planning doc. Decided on web app and free tier (Next.js + Supabase + Vercel).
- 2026-10-23: Rewritten in English, code removed from the doc.
- 2026-10-23: App named Cleofas. Reply permissions follow post visibility. Anonymous replies added as a setting (is_anonymous on replies).
- 2026-10-23: Auth decided: Google (Gmail) sign-in only.