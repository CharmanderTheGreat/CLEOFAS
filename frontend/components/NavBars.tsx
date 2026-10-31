"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, House, PenLine, Search } from "lucide-react";
import { Avatar } from "./Avatar";

export const COMPOSE_EVENT = "cleofas:compose";

type Props = { username: string; avatarPath: string | null; unread: number };

function openComposer() {
  window.dispatchEvent(new Event(COMPOSE_EVENT));
}

function useActive(username: string) {
  const pathname = usePathname();
  return {
    home: pathname === "/",
    search: pathname.startsWith("/search"),
    notifications: pathname.startsWith("/notifications"),
    profile: pathname === `/u/${username}` || pathname.startsWith(`/u/${username}/`),
  };
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} unread`}
      className="absolute -right-1 -top-1 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-bold leading-4 text-on-accent"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

// Icon with a label for screen readers and a tooltip. The active tab gets a soft pill and an indicator bar.
function Tab({
  href,
  label,
  active,
  children,
  layout,
}: {
  href: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
  layout: "top" | "bottom";
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center justify-center transition-colors ${
        layout === "top" ? "h-10 w-11 rounded-xl" : "h-14 flex-1"
      } ${active ? "text-accent" : "text-muted hover:text-accent"} ${layout === "top" && active ? "bg-accent-soft" : ""}`}
    >
      {layout === "bottom" && (
        <span
          aria-hidden
          className={`absolute left-1/2 top-0 h-[3px] -translate-x-1/2 rounded-b-full bg-accent transition-all duration-300 ${
            active ? "w-8 opacity-100" : "w-0 opacity-0"
          }`}
        />
      )}
      <span className={`relative transition-transform duration-200 ${active ? "scale-110" : ""}`}>{children}</span>
      {layout === "top" && (
        <span
          aria-hidden
          className={`absolute bottom-1 left-1/2 h-1 -translate-x-1/2 rounded-full bg-accent transition-all duration-300 ${
            active ? "w-1 opacity-100" : "w-0 opacity-0"
          }`}
        />
      )}
    </Link>
  );
}

function ProfileIcon({ username, avatarPath, active }: { username: string; avatarPath: string | null; active: boolean }) {
  return (
    <span className={`inline-flex rounded-full ring-2 transition ${active ? "ring-accent" : "ring-transparent"}`}>
      <Avatar username={username} path={avatarPath} size={24} />
    </span>
  );
}

// Desktop: icons in the top bar.
export function TopNav({ username, avatarPath, unread }: Props) {
  const active = useActive(username);
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      <Tab href="/" label="Home" active={active.home} layout="top">
        <House size={22} strokeWidth={active.home ? 2.4 : 2} />
      </Tab>
      <Tab href="/search" label="Find people" active={active.search} layout="top">
        <Search size={22} strokeWidth={active.search ? 2.4 : 2} />
      </Tab>
      <Tab href="/notifications" label="Notifications" active={active.notifications} layout="top">
        <Bell size={22} strokeWidth={active.notifications ? 2.4 : 2} />
        <Badge count={unread} />
      </Tab>
      <Tab href={`/u/${username}`} label="Your profile" active={active.profile} layout="top">
        <ProfileIcon username={username} avatarPath={avatarPath} active={active.profile} />
      </Tab>
      <button
        type="button"
        onClick={openComposer}
        aria-label="Write a post"
        title="Write a post"
        className="ml-2 inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-sm font-medium text-on-accent transition hover:bg-accent-strong active:scale-95"
      >
        <PenLine size={18} aria-hidden /> Write
      </button>
    </nav>
  );
}

// Phone: tab bar fixed at the bottom with the "write" button in the middle, always in thumb reach.
export function BottomNav({ username, avatarPath, unread }: Props) {
  const active = useActive(username);
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto flex max-w-2xl items-center">
        <Tab href="/" label="Home" active={active.home} layout="bottom">
          <House size={24} strokeWidth={active.home ? 2.4 : 2} />
        </Tab>
        <Tab href="/search" label="Find people" active={active.search} layout="bottom">
          <Search size={24} strokeWidth={active.search ? 2.4 : 2} />
        </Tab>

        <div className="flex flex-1 items-center justify-center">
          <button
            type="button"
            onClick={openComposer}
            aria-label="Write a post"
            title="Write a post"
            className="-mt-6 inline-flex h-14 w-14 items-center justify-center rounded-full bg-accent text-on-accent shadow-lg ring-4 ring-paper transition active:scale-90"
          >
            <PenLine size={24} aria-hidden />
          </button>
        </div>

        <Tab href="/notifications" label="Notifications" active={active.notifications} layout="bottom">
          <Bell size={24} strokeWidth={active.notifications ? 2.4 : 2} />
          <Badge count={unread} />
        </Tab>
        <Tab href={`/u/${username}`} label="Your profile" active={active.profile} layout="bottom">
          <ProfileIcon username={username} avatarPath={avatarPath} active={active.profile} />
        </Tab>
      </div>
    </nav>
  );
}
