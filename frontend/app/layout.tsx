import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { signOut } from "./actions";
import { LiveRefresh } from "@/components/LiveRefresh";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getUnreadCount, getViewer, isOnboarded } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Cleofas", template: "%s · Cleofas" },
  description: "A safe place to rant. You choose who can see and reply.",
  appleWebApp: { capable: true, title: "Cleofas", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f7f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1612" },
  ],
  width: "device-width",
  initialScale: 1,
};

// Runs before first paint so the page never flashes the wrong theme.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Shared with the page through React cache(): no extra auth or profile query.
  const viewer = await getViewer();
  const showNav = viewer !== null && isOnboarded(viewer);
  const unread = showNav ? await getUnreadCount() : 0;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
          <nav className="mx-auto flex max-w-2xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
            <Link href="/" className="text-lg font-bold tracking-tight text-accent">
              Cleofas
            </Link>
            {showNav && viewer && (
              <>
                <Link href="/" className="link-quiet">Home</Link>
                <Link href="/search" className="link-quiet">Find people</Link>
                <Link href="/notifications" className="link-quiet inline-flex items-center gap-1">
                  Notifications
                  {unread > 0 && (
                    <span
                      aria-label={`${unread} unread`}
                      className="rounded-full bg-accent px-1.5 text-xs font-semibold leading-5 text-on-accent"
                    >
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </Link>
                <Link href={`/u/${viewer.username}`} className="link-quiet">Profile</Link>
                <Link href="/settings" className="link-quiet">Settings</Link>
              </>
            )}
            <div className="ml-auto flex items-center gap-3">
              <ThemeToggle />
              {viewer && (
                <form action={signOut}>
                  <button type="submit" className="link-quiet">Sign out</button>
                </form>
              )}
            </div>
          </nav>
        </header>

        {showNav && viewer && <LiveRefresh topic={`user:${viewer.id}`} event="notify" />}
        <RegisterServiceWorker />

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
