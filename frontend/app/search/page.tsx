import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { requireOnboarded } from "@/lib/auth";

export const metadata: Metadata = { title: "Find people" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const { supabase } = await requireOnboarded();

  // Usernames only contain [a-z0-9_.-]; stripping everything else also neutralises LIKE wildcards.
  const term = q.toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 20);

  // One query: prefix match, without yourself and without anyone blocked in either direction.
  let people: { id: string; username: string; avatar_path: string | null }[] = [];
  if (term.length >= 2) {
    const { data, error } = await supabase.rpc("search_profiles", { p_term: term });
    if (error) throw new Error("Search failed.");
    people = data ?? [];
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
            <Link href={`/u/${person.username}`} className="card flex items-center gap-3 hover:border-accent">
              <Avatar username={person.username} path={person.avatar_path} size={36} />
              <span className="font-medium">@{person.username}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
