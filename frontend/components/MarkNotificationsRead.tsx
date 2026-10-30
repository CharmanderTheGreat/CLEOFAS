"use client";

import { useEffect } from "react";
import { markNotificationsRead } from "@/app/actions";

// Marks everything as read a moment after the page is shown, so the badge goes away.
export function MarkNotificationsRead({ hasUnread }: { hasUnread: boolean }) {
  useEffect(() => {
    if (!hasUnread) return;
    const timer = setTimeout(() => void markNotificationsRead(), 1500);
    return () => clearTimeout(timer);
  }, [hasUnread]);
  return null;
}
