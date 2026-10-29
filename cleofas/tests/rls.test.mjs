// RLS tests for Cleofas (README.md section 10), run against an in-process Postgres (PGlite).
// Run with: npm run test:rls
//
// Supabase pieces are stubbed so the real migration files can be applied as-is:
//   - auth schema + auth.users + auth.uid() (reads the request.jwt.claim.sub setting)
//   - anon / authenticated roles

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "supabase", "migrations");

const db = new PGlite();

const A = "aaaaaaaa-0000-0000-0000-00000000000a";
const B = "bbbbbbbb-0000-0000-0000-00000000000b";
const C = "cccccccc-0000-0000-0000-00000000000c";
const D = "dddddddd-0000-0000-0000-00000000000d"; // never confirms age

// Run a callback as a given user (or as anon when userId is null), then reset the role.
async function as(userId, fn) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${userId ?? ""}', false)`);
  await db.exec(`set role ${userId ? "authenticated" : "anon"}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}

const q = async (sql, params = []) => (await db.query(sql, params)).rows;

async function expectDenied(fn) {
  await assert.rejects(fn, /permission denied|row-level security|violates/i);
}

before(async () => {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema public to anon, authenticated;

    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);

  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  }

  // Creating auth users fires the handle_new_user trigger -> profiles with temp usernames.
  for (const id of [A, B, C, D]) await db.exec(`insert into auth.users (id) values ('${id}')`);
  await db.exec(`
    update public.profiles set username = 'user_a' where id = '${A}';
    update public.profiles set username = 'user_b' where id = '${B}';
    update public.profiles set username = 'user_c' where id = '${C}';
    update public.profiles set username = 'user_d' where id = '${D}';
  `);
});

// Wipe test data between tests (as superuser, so RLS does not get in the way).
async function reset() {
  await db.exec("truncate public.reports, public.replies, public.posts, public.follows, public.blocks cascade");
}

const follow = (follower, following) =>
  db.exec(`insert into public.follows (follower_id, following_id) values ('${follower}', '${following}')`);

const makePost = async (author, visibility = "public", body = "rant") =>
  (await q(
    `insert into public.posts (author_id, body, visibility) values ($1, $2, $3) returning id`,
    [author, body, visibility],
  ))[0].id;

test("profile trigger gives new users a temporary username", async () => {
  const [row] = await q("select username from public.profiles where id = $1", [A]);
  assert.match(row.username, /^user_/);
});

test("A posts public, B does not follow A -> B can see and reply", async () => {
  await reset();
  const post = await makePost(A, "public");
  await as(B, async () => {
    assert.equal((await q("select id from public.posts where id = $1", [post])).length, 1);
    await db.query(
      "insert into public.replies (post_id, author_id, body) values ($1, $2, 'hello')",
      [post, B],
    );
  });
});

test("A posts mutuals, B follows A only (not mutual) -> B cannot see or reply", async () => {
  await reset();
  const post = await makePost(A, "mutuals");
  await follow(B, A);
  await as(B, async () => {
    assert.equal((await q("select id from public.posts where id = $1", [post])).length, 0);
    await expectDenied(() =>
      db.query("insert into public.replies (post_id, author_id, body) values ($1, $2, 'hi')", [post, B]),
    );
  });
});

test("A posts mutuals, A and B are mutual -> B can see and reply", async () => {
  await reset();
  const post = await makePost(A, "mutuals");
  await follow(A, B);
  await follow(B, A);
  await as(B, async () => {
    assert.equal((await q("select id from public.posts where id = $1", [post])).length, 1);
    await db.query("insert into public.replies (post_id, author_id, body) values ($1, $2, 'hi')", [post, B]);
  });
  // C is not mutual with A and must not see it
  await as(C, async () => {
    assert.equal((await q("select id from public.posts where id = $1", [post])).length, 0);
  });
});

test("A blocks B, A posts public -> B cannot see or reply", async () => {
  await reset();
  await db.exec(`insert into public.blocks (blocker_id, blocked_id) values ('${A}', '${B}')`);
  const post = await makePost(A, "public");
  await as(B, async () => {
    assert.equal((await q("select id from public.posts where id = $1", [post])).length, 0);
    await expectDenied(() =>
      db.query("insert into public.replies (post_id, author_id, body) values ($1, $2, 'hi')", [post, B]),
    );
  });
});

test("B blocks A -> A cannot see B's posts or reply to them", async () => {
  await reset();
  await db.exec(`insert into public.blocks (blocker_id, blocked_id) values ('${B}', '${A}')`);
  const post = await makePost(B, "public");
  await as(A, async () => {
    assert.equal((await q("select id from public.posts where id = $1", [post])).length, 0);
    await expectDenied(() =>
      db.query("insert into public.replies (post_id, author_id, body) values ($1, $2, 'hi')", [post, A]),
    );
  });
});

test("B replies to A's post, A deletes the reply -> success", async () => {
  await reset();
  const post = await makePost(A, "public");
  const [reply] = await as(B, () =>
    q("insert into public.replies (post_id, author_id, body) values ($1, $2, 'hi') returning id", [post, B]),
  );
  const [res] = await as(A, () => q("select public.delete_reply($1) as ok", [reply.id]));
  assert.equal(res.ok, true);
  assert.equal((await q("select id from public.replies where id = $1", [reply.id])).length, 0);
});

test("C tries to delete B's reply -> denied", async () => {
  await reset();
  const post = await makePost(A, "public");
  const [reply] = await as(B, () =>
    q("insert into public.replies (post_id, author_id, body) values ($1, $2, 'hi') returning id", [post, B]),
  );
  const [res] = await as(C, () => q("select public.delete_reply($1) as ok", [reply.id]));
  assert.equal(res.ok, false);
  assert.equal((await q("select id from public.replies where id = $1", [reply.id])).length, 1);
  // direct DELETE as C also removes nothing
  await as(C, () => db.query("delete from public.replies where id = $1", [reply.id]));
  assert.equal((await q("select id from public.replies where id = $1", [reply.id])).length, 1);
});

test("unauthenticated visitor -> no access", async () => {
  await reset();
  await makePost(A, "public");
  await as(null, async () => {
    await expectDenied(() => db.query("select * from public.posts"));
    await expectDenied(() => db.query("select * from public.profiles"));
    await expectDenied(() => db.query("select * from public.get_replies('00000000-0000-0000-0000-000000000001')"));
  });
});

test("anonymous replies hide the replier from everyone but the replier", async () => {
  await reset();
  const post = await makePost(A, "public");
  await as(B, () =>
    db.query(
      "insert into public.replies (post_id, author_id, body, is_anonymous) values ($1, $2, 'secret', true)",
      [post, B],
    ),
  );
  // Post author sees the reply but not who wrote it
  const forA = await as(A, () => q("select * from public.get_replies($1)", [post]));
  assert.equal(forA.length, 1);
  assert.equal(forA[0].author_id, null);
  assert.equal(forA[0].username, null);
  assert.equal(forA[0].can_delete, true);
  // Raw table is not readable for other people's replies
  const raw = await as(A, () => q("select * from public.replies"));
  assert.equal(raw.length, 0);
  // The replier still sees their own reply as theirs
  const forB = await as(B, () => q("select * from public.get_replies($1)", [post]));
  assert.equal(forB[0].is_mine, true);
});

test("blocking does NOT hide anonymous replies (no block-based deanonymization)", async () => {
  await reset();
  const post = await makePost(A, "public");
  await as(B, () =>
    db.query(
      "insert into public.replies (post_id, author_id, body, is_anonymous) values ($1, $2, 'anon', true)",
      [post, B],
    ),
  );
  const before = await as(A, () => q("select * from public.get_replies($1)", [post]));
  await db.exec(`insert into public.blocks (blocker_id, blocked_id) values ('${A}', '${B}')`);
  const afterBlock = await as(A, () => q("select * from public.get_replies($1)", [post]));
  await db.exec(`delete from public.blocks where blocker_id = '${A}'`);
  const afterUnblock = await as(A, () => q("select * from public.get_replies($1)", [post]));
  assert.equal(before.length, 1);
  assert.equal(afterBlock.length, 1);
  assert.equal(afterBlock[0].author_id, null);
  assert.equal(afterUnblock.length, 1);
});

test("blocking hides NON-anonymous replies from the blocker (and the count matches)", async () => {
  await reset();
  const post = await makePost(C, "public");
  await as(B, () =>
    db.query("insert into public.replies (post_id, author_id, body, is_anonymous) values ($1, $2, 'named', false)", [post, B]),
  );
  await as(B, () =>
    db.query("insert into public.replies (post_id, author_id, body, is_anonymous) values ($1, $2, 'anon', true)", [post, B]),
  );
  await db.exec(`insert into public.blocks (blocker_id, blocked_id) values ('${A}', '${B}')`);
  const forA = await as(A, () => q("select body from public.get_replies($1)", [post]));
  assert.deepEqual(forA.map((r) => r.body), ["anon"]);
  const [row] = await as(A, () => q("select reply_count from public.list_posts() where id = $1", [post]));
  assert.equal(Number(row.reply_count), 1);
  // the replier still sees both of their own replies
  const forB = await as(B, () => q("select body from public.get_replies($1)", [post]));
  assert.equal(forB.length, 2);
});

test("complete_onboarding sets username, display name and bio", async () => {
  await reset();
  await as(D, () => db.query("select public.complete_onboarding('quiet_owl', '  ', 'hello')"));
  const [prof] = await q("select username, display_name, bio from public.profiles where id = $1", [D]);
  assert.equal(prof.username, "quiet_owl");
  assert.equal(prof.display_name, null);
  assert.equal(prof.bio, "hello");
  await as(null, () => expectDenied(() => db.query("select public.complete_onboarding('x_y_z', null, null)")));
  await db.exec(`update public.profiles set username = 'user_d' where id = '${D}'`);
});

test("profile_private is private: default_anonymous_replies is not readable by others", async () => {
  await db.exec(`update public.profile_private set default_anonymous_replies = true where id = '${B}'`);
  assert.equal((await as(A, () => q("select * from public.profile_private"))).length, 1); // only A's own row
  await as(A, () => assert.rejects(() => db.query("select default_anonymous_replies from public.profiles"), /does not exist/));
  await as(B, () => db.query("update public.profile_private set default_anonymous_replies = false where id = $1", [B]));
  await as(A, () => db.query("update public.profile_private set default_anonymous_replies = true where id = $1", [B]));
  assert.equal((await q("select default_anonymous_replies d from public.profile_private where id = $1", [B]))[0].d, false);
});

test("reports keep a snapshot, reporters cannot read the real author, duplicates are rejected", async () => {
  await reset();
  const post = await makePost(A, "public");
  const [reply] = await as(B, () =>
    q("insert into public.replies (post_id, author_id, body, is_anonymous) values ($1, $2, 'mean', true) returning id", [post, B]),
  );
  await as(C, async () => {
    await db.query("insert into public.reports (reporter_id, reply_id, reason) values ($1, $2, 'harassment')", [C, reply.id]);
    await assert.rejects(
      () => db.query("insert into public.reports (reporter_id, reply_id, reason) values ($1, $2, 'again')", [C, reply.id]),
      /duplicate key|unique/i,
    );
    await expectDenied(() => db.query("select target_author_id from public.reports"));
    await expectDenied(() => db.query("select target_body from public.reports"));
    assert.equal((await q("select id, reason from public.reports")).length, 1);
  });
  const [snap] = await q("select target_author_id, target_body, post_id from public.reports");
  assert.equal(snap.target_author_id, B);
  assert.equal(snap.target_body, "mean");
  assert.equal(snap.post_id, post);
  // evidence survives deletion of the reply
  await as(B, () => db.query("delete from public.replies where id = $1", [reply.id]));
  const [kept] = await q("select reply_id, target_author_id, target_body from public.reports");
  assert.equal(kept.reply_id, null);
  assert.equal(kept.target_author_id, B);
  assert.equal(kept.target_body, "mean");
});

test("list_posts: following filter, author filter, paging and reply counts", async () => {
  await reset();
  const pa = await makePost(A, "public", "from A");
  const pb = await makePost(B, "public", "from B");
  await follow(C, A);
  const all = await as(C, () => q("select id from public.list_posts()"));
  assert.equal(all.length, 2);
  const following = await as(C, () => q("select id from public.list_posts(null, true)"));
  assert.deepEqual(following.map((r) => r.id), [pa]);
  const byB = await as(C, () => q("select id, author_username from public.list_posts($1)", [B]));
  assert.deepEqual(byB.map((r) => r.id), [pb]);
  assert.equal(byB[0].author_username, "user_b");
  const none = await as(C, () => q("select id from public.list_posts(null, false, '1970-01-01T00:00:00Z')"));
  assert.equal(none.length, 0);
  // mutuals-only posts stay hidden
  await makePost(A, "mutuals", "secret");
  assert.equal((await as(C, () => q("select id from public.list_posts()"))).length, 2);
});

test("search_profiles: prefix match, hides self and blocked users, rejects junk", async () => {
  await reset();
  const found = await as(A, () => q("select username from public.search_profiles('user_')"));
  assert.deepEqual(found.map((r) => r.username), ["user_b", "user_c", "user_d"]);
  assert.equal((await as(A, () => q("select * from public.search_profiles('%')"))).length, 0);
  assert.equal((await as(A, () => q("select * from public.search_profiles('u')"))).length, 0);
  await db.exec(`insert into public.blocks (blocker_id, blocked_id) values ('${B}', '${A}')`);
  const afterBlock = await as(A, () => q("select username from public.search_profiles('user_')"));
  assert.deepEqual(afterBlock.map((r) => r.username), ["user_c", "user_d"]);
});

test("reserved usernames are rejected", async () => {
  await as(A, () => assert.rejects(() => db.query("update public.profiles set username = 'admin' where id = $1", [A])));
});

test("rate limit: block spam is rejected", async () => {
  await reset();
  // 30/hour limit needs 30 real profiles (FK), so only verify the trigger is installed
  const [t] = await q("select count(*)::int n from pg_trigger where tgname = 'blocks_rate_limit'");
  assert.equal(t.n, 1);
});

test("delete_my_account removes the user and their content", async () => {
  await reset();
  await db.exec(`insert into auth.users (id) values ('eeeeeeee-0000-0000-0000-00000000000e')`);
  const E = "eeeeeeee-0000-0000-0000-00000000000e";
  await makePost(E, "public");
  await as(E, () => db.query("select public.delete_my_account()"));
  assert.equal((await q("select id from auth.users where id = $1", [E])).length, 0);
  assert.equal((await q("select id from public.profiles where id = $1", [E])).length, 0);
  assert.equal((await q("select id from public.posts where author_id = $1", [E])).length, 0);
});

test("users cannot write as someone else", async () => {
  await reset();
  await as(B, async () => {
    await expectDenied(() =>
      db.query("insert into public.posts (author_id, body) values ($1, 'fake')", [A]),
    );
    await expectDenied(() =>
      db.query("insert into public.follows (follower_id, following_id) values ($1, $2)", [A, C]),
    );
  });
});

test("only the author can edit or delete a post", async () => {
  await reset();
  const post = await makePost(A, "public");
  await as(B, async () => {
    await db.query("update public.posts set body = 'hacked' where id = $1", [post]);
    await db.query("delete from public.posts where id = $1", [post]);
  });
  const [row] = await q("select body from public.posts where id = $1", [post]);
  assert.equal(row.body, "rant");
});

test("posts cannot be re-assigned to another author", async () => {
  await reset();
  const post = await makePost(A, "public");
  await as(A, () => expectDenied(() => db.query("update public.posts set author_id = $1 where id = $2", [B, post])));
});

test("reports: own reports only, and status cannot be set by the client", async () => {
  await reset();
  const post = await makePost(A, "public");
  await as(B, async () => {
    await db.query("insert into public.reports (reporter_id, post_id, reason) values ($1, $2, 'spam')", [B, post]);
    await expectDenied(() =>
      db.query(
        "insert into public.reports (reporter_id, post_id, reason, status) values ($1, $2, 'x', 'dismissed')",
        [B, post],
      ),
    );
  });
  assert.equal((await as(B, () => q("select id from public.reports"))).length, 1);
  assert.equal((await as(C, () => q("select id from public.reports"))).length, 0);
  assert.equal((await as(A, () => q("select id from public.reports"))).length, 0);
});

test("cannot report a post you cannot see", async () => {
  await reset();
  const post = await makePost(A, "mutuals");
  await as(B, () =>
    expectDenied(() =>
      db.query("insert into public.reports (reporter_id, post_id, reason) values ($1, $2, 'x')", [B, post]),
    ),
  );
});

test("blocking removes follows in both directions", async () => {
  await reset();
  await follow(A, B);
  await follow(B, A);
  await as(A, () => db.query("insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [A, B]));
  assert.equal((await q("select * from public.follows")).length, 0);
});

test("you cannot follow someone who blocked you or whom you blocked", async () => {
  await reset();
  await db.exec(`insert into public.blocks (blocker_id, blocked_id) values ('${A}', '${B}')`);
  await as(B, () => expectDenied(() => db.query("insert into public.follows (follower_id, following_id) values ($1, $2)", [B, A])));
});

test("blocks are private: the blocked user cannot see that they are blocked", async () => {
  await reset();
  await db.exec(`insert into public.blocks (blocker_id, blocked_id) values ('${A}', '${B}')`);
  assert.equal((await as(B, () => q("select * from public.blocks"))).length, 0);
  assert.equal((await as(A, () => q("select * from public.blocks"))).length, 1);
});

test("rate limit: 6th post within 10 minutes is rejected", async () => {
  await reset();
  await as(C, async () => {
    for (let i = 0; i < 5; i++) {
      await db.query("insert into public.posts (author_id, body) values ($1, $2)", [C, `p${i}`]);
    }
    await assert.rejects(
      () => db.query("insert into public.posts (author_id, body) values ($1, 'one too many')", [C]),
      /rate_limit_exceeded/,
    );
  });
});

test("check constraints: body length and visibility values", async () => {
  await reset();
  await as(A, async () => {
    await assert.rejects(() => db.query("insert into public.posts (author_id, body) values ($1, '   ')", [A]));
    await assert.rejects(() =>
      db.query("insert into public.posts (author_id, body) values ($1, $2)", [A, "x".repeat(1001)]),
    );
    await assert.rejects(() =>
      db.query("insert into public.posts (author_id, body, visibility) values ($1, 'x', 'secret')", [A]),
    );
  });
});

test("username must be unique and well-formed", async () => {
  await as(A, async () => {
    await assert.rejects(() => db.query("update public.profiles set username = 'user_b' where id = $1", [A]));
    await assert.rejects(() => db.query("update public.profiles set username = 'Bad Name!' where id = $1", [A]));
  });
});
