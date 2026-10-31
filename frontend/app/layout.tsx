import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { LifeBuoy, Settings } from "lucide-react";
import { ComposeDialog } from "@/components/ComposeDialog";
import { LiveRefresh } from "@/components/LiveRefresh";
import { BottomNav, TopNav } from "@/components/NavBars";
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
  viewportFit: "cover",
};

// Runs before first paint so the page never flashes the wrong theme.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

const iconButton =
  "inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-accent-soft hover:text-accent";

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
        <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
          <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-2">
            <Link href="/" className="text-lg font-bold tracking-tight text-accent">
              Cleofas
            </Link>

            {showNav && viewer && (
              <div className="ml-3">
                <TopNav username={viewer.username} avatarPath={viewer.avatar_path} unread={unread} />
              </div>
            )}

            <div className="ml-auto flex items-center gap-1">
              {/* Always visible at the top: it used to sit at the very bottom of an endless feed. */}
              <Link href="/help" aria-label="Feeling overwhelmed? Crisis resources" title="Feeling overwhelmed? Crisis resources" className={iconButton}>
                <LifeBuoy size={20} aria-hidden />
              </Link>
              {showNav && (
                <Link href="/settings" aria-label="Settings" title="Settings" className={iconButton}>
                  <Settings size={20} aria-hidden />
                </Link>
              )}
              <ThemeToggle />
            </div>
          </div>
        </header>

        {showNav && viewer && (
          <>
            <LiveRefresh topic={`user:${viewer.id}`} event="notify" />
            <ComposeDialog />
          </>
        )}
        <RegisterServiceWorker />

        <main className={`mx-auto max-w-2xl px-4 py-6 ${showNav ? "pb-28 md:pb-10" : ""}`}>{children}</main>

        {showNav && viewer && <BottomNav username={viewer.username} avatarPath={viewer.avatar_path} unread={unread} />}
      </body>
    </html>
  );
}
