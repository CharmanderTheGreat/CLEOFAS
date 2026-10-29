import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { signOut } from "./actions";
import { getViewer, isOnboarded } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Cleofas", template: "%s · Cleofas" },
  description: "A safe place to rant. You choose who can see and reply.",
};

export const viewport: Viewport = {
  themeColor: "#faf7f2",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Shared with the page through React cache(): no extra auth or profile query.
  const viewer = await getViewer();
  const showNav = viewer !== null && isOnboarded(viewer);

  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
          <nav className="mx-auto flex max-w-2xl items-center gap-4 px-4 py-3 text-sm">
            <Link href="/" className="text-lg font-bold tracking-tight text-accent">
              Cleofas
            </Link>
            {viewer && (
              <>
                {showNav && (
                  <>
                    <Link href="/" className="link-quiet">Home</Link>
                    <Link href="/search" className="link-quiet">Find people</Link>
                    <Link href={`/u/${viewer.username}`} className="link-quiet">Profile</Link>
                    <Link href="/settings" className="link-quiet">Settings</Link>
                  </>
                )}
                <form action={signOut} className="ml-auto">
                  <button type="submit" className="link-quiet">Sign out</button>
                </form>
              </>
            )}
          </nav>
        </header>

        <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>

        <footer className="mx-auto max-w-2xl px-4 pb-10 pt-4 text-center text-xs text-muted">
          Feeling overwhelmed?{" "}
          <Link href="/help" className="text-accent underline">
            Crisis resources
          </Link>
        </footer>
      </body>
    </html>
  );
}
