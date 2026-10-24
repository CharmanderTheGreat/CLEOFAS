// RLS tests for Cleofas (PROJECT.md section 10), run against an in-process Postgres (PGlite).
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
  for (const id of [A, B, C]) await db.exec(`insert into auth.users (id) values ('${id}')`);
  await db.exec(`
    update public.profiles set username = 'user_a' where id = '${A}';
    update public.profiles set username = 'user_b' where id = '${B}';
    update public.profiles set username = 'user_c' where id = '${C}';
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

test("blocking still hides anonymous replies from the blocker", async () => {
  await reset();
  const post = await makePost(A, "public");
  await as(B, () =>
    db.query(
      "insert into public.replies (post_id, author_id, body, is_anonymous) values ($1, $2, 'anon', true)",
      [post, B],
    ),
  );
  await db.exec(`insert into public.blocks (blocker_id, blocked_id) values ('${A}', '${B}')`);
  const forA = await as(A, () => q("select * from public.get_replies($1)", [post]));
  assert.equal(forA.length, 0);
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
