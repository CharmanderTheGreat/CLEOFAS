import { COOLDOWN_DAYS } from "@/lib/constants";

// Public URL of a profile picture stored in the "avatars" bucket.
export function avatarUrl(path: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return path && base ? `${base}/storage/v1/object/public/avatars/${path}` : null;
}

// When is a username / picture change allowed again? null = allowed now.
export function cooldownEnds(changedAt: string | null | undefined, now: number = Date.now()): Date | null {
  if (!changedAt) return null;
  const ends = new Date(changedAt).getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  return ends > now ? new Date(ends) : null;
}

export function formatCooldown(date: Date): string {
  return date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

// Checks the real file type from its first bytes (the browser-provided type can be faked).
export function detectImage(bytes: Uint8Array): { ext: "webp" | "jpg" | "png"; mime: string } | null {
  const is = (offset: number, ...values: number[]) => values.every((value, i) => bytes[offset + i] === value);
  if (is(0, 0xff, 0xd8, 0xff)) return { ext: "jpg", mime: "image/jpeg" };
  if (is(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { ext: "png", mime: "image/png" };
  if (is(0, 0x52, 0x49, 0x46, 0x46) && is(8, 0x57, 0x45, 0x42, 0x50)) return { ext: "webp", mime: "image/webp" };
  return null;
}
