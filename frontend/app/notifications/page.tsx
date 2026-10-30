import type { Metadata } from "next";
import Link from "next/link";
import { MarkNotificationsRead } from "@/components/MarkNotificationsRead";
import { requireOnboarded } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import type { NotificationRow } from "@/lib/types";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const { supabase } = await requireOnboarded();

  // Anonymous repliers come back without a name: the database never sends it.
  const { data, error } = await supabase.rpc("get_notifications", { p_limit: 50 });
  if (error) throw new Error("Could not load notifications.");
  const items = (data ?? []) as NotificationRow[];
  const hasUnread = items.some((item) => !item.is_read);

  return (
    <div className="space-y-4">
      <MarkNotificationsRead hasUnread={hasUnread} />
      <h1 className="text-xl font-bold">Notifications</h1>

      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Nothing yet. Replies to your posts show up here.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/post/${item.post_id}`}
                className={`card block space-y-1 transition hover:bg-accent-soft ${
                  item.is_read ? "" : "border-accent"
                }`}
              >
                <p className="text-sm">
                  <span className="font-semibold">
                    {item.actor_username ? `@${item.actor_username}` : "Someone"}
                  </span>{" "}
                  replied{item.is_anonymous ? " anonymously" : ""} to your post
                  <span className="text-muted"> · </span>
                  <time dateTime={item.created_at} className="text-muted" suppressHydrationWarning>
                    {timeAgo(item.created_at)}
                  </time>
                  {!item.is_read && <span className="ml-2 rounded-full bg-accent px-1.5 text-xs text-on-accent">new</span>}
                </p>
                <p className="line-clamp-2 break-words text-sm">{item.reply_snippet}</p>
                <p className="line-clamp-1 break-words text-xs text-muted">On: {item.post_snippet}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
