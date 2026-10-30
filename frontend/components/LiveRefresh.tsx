"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Listens to a private Supabase Realtime channel and re-reads the page when something happens.
// The events carry NO data (see on_reply_created in migration 0006): the page re-fetches through
// the normal database functions, so anonymous replies can never leak through realtime.
// If realtime is unavailable the page simply works without live updates.
export function LiveRefresh({ topic, event }: { topic: string; event: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function start() {
      const { data } = await supabase.auth.getSession();
      if (cancelled || !data.session) return;
      await supabase.realtime.setAuth(data.session.access_token);

      channel = supabase
        .channel(topic, { config: { private: true } })
        .on("broadcast", { event }, () => {
          // Several events in a row become one refresh.
          clearTimeout(timer);
          timer = setTimeout(() => router.refresh(), 300);
        })
        .subscribe();
    }

    start().catch(() => {});

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [topic, event, router]);

  return null;
}
