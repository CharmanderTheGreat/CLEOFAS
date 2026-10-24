import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded } from "@/lib/auth";

export const metadata: Metadata = { title: "Find people" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const { supabase, user } = await requireOnboarded();

  // Usernames only contain [a-z0-9_]; stripping everything else also neutralises LIKE wildcards.
  const term = q.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);

  let people: { id: string; username: string; display_name: string | null }[] = [];
  if (term.length >= 2) {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .ilike("username", `${term.replace(/_/g, "\\_")}%`)
      .neq("id", user.id)
      .limit(20);

    // Hide people who blocked you / whom you blocked.
    const rows = data ?? [];
    const blockedFlags = await Promise.all(
      rows.map(async (row) => {
        const { data: blocked } = await supabase.rpc("is_blocked", { a: user.id, b: row.id });
        return Boolean(blocked);
      }),
    );
    people = rows.filter((_, index) => !blockedFlags[index]);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Find people</h1>
      <form className="flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          Search by username
        </label>
        <input id="q" name="q" defaultValue={q} placeholder="Search by username" className="input" autoComplete="off" />
        <button type="submit" className="btn-primary">
          Search
        </button>
      </form>

      {term.length >= 2 && people.length === 0 && <p className="py-6 text-center text-sm text-muted">No one found.</p>}
      {term.length > 0 && term.length < 2 && <p className="text-sm text-muted">Type at least 2 characters.</p>}

      <ul className="space-y-2">
        {people.map((person) => (
          <li key={person.id}>
            <Link href={`/u/${person.username}`} className="card block hover:border-accent">
              <span className="font-medium">{person.display_name || `@${person.username}`}</span>
              {person.display_name && <span className="ml-2 text-sm text-muted">@{person.username}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
