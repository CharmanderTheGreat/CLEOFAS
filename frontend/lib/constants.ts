export const MAX_POST_LENGTH = 1000;
export const MAX_REPLY_LENGTH = 500;
export const MAX_BIO_LENGTH = 160;
export const MAX_REPORT_REASON_LENGTH = 500;
export const FEED_PAGE_SIZE = 20;
export const MAX_MUTED_WORDS = 30;
export const MAX_MUTED_WORD_LENGTH = 40;
// A muted word: letters/numbers first, then letters, numbers, spaces, apostrophe, hyphen, underscore.
export const MUTED_WORD_REGEX = /^[\p{L}\p{N}][\p{L}\p{N} '_-]*$/u;

// Minimum age shown as a notice on the login page (README.md section 11). Not verified or stored.
export const MIN_AGE = 13;

// New usernames: 5-20 characters, letters (stored lowercase), numbers and _ . -
// They must start and end with a letter or number, and never have two symbols in a row.
// Kept in sync with profiles_guard() in supabase/migrations/0007_phase3.sql.
export const USERNAME_MIN_LENGTH = 5;
export const USERNAME_MAX_LENGTH = 20;
export const USERNAME_REGEX = /^[a-z0-9][a-z0-9_.-]{3,18}[a-z0-9]$/;
export function isValidUsername(username: string): boolean {
  return USERNAME_REGEX.test(username) && !/[._-]{2}/.test(username);
}
// Looser check for URLs only, so profiles with an older, shorter username still open.
export const USERNAME_LOOKUP_REGEX = /^[a-z0-9][a-z0-9_.-]{1,30}$/;

// Username and profile picture can each be changed once every 7 days.
export const COOLDOWN_DAYS = 7;
export const AVATAR_MAX_BYTES = 300 * 1024;
export const AVATAR_SIZE = 256;

export const MAX_CONTENT_WARNING_LENGTH = 80;
// Vent mode: the post disappears after this many days.
export const VENT_OPTIONS = [
  { days: 1, label: "1 day" },
  { days: 3, label: "3 days" },
  { days: 7, label: "7 days" },
] as const;

export const REACTIONS = [
  { kind: "hug", emoji: "🤗", label: "Hug" },
  { kind: "relate", emoji: "🤝", label: "Relate" },
  { kind: "strength", emoji: "💪", label: "Stay strong" },
  { kind: "care", emoji: "💚", label: "Care" },
] as const;
export type ReactionKind = (typeof REACTIONS)[number]["kind"];
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Kept in sync with profiles_username_reserved in supabase/migrations/0004_hardening.sql.
export const RESERVED_USERNAMES = [
  "admin", "administrator", "mod", "moderator", "support", "staff", "cleofas",
  "official", "system", "root", "help", "anonymous", "deleted",
] as const;
// Profiles created by the database trigger get a temporary name like user_1a2b3c4d.
export const TEMP_USERNAME_REGEX = /^user_[0-9a-f]{8}$/;

export const VISIBILITIES = ["public", "mutuals"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

// National Center for Mental Health (NCMH) crisis hotline, 24/7.
// Verified against a Philippine Information Agency article dated 2025-10-28
// (pia.gov.ph). Numbers change, so re-check them before every public launch.
export const CRISIS_LINES = [
  { label: "NCMH Crisis Hotline (landline, nationwide)", value: "1553" },
  { label: "NCMH Crisis Hotline (toll-free, Smart/TNT)", value: "1800-1888-1553" },
  { label: "NCMH Crisis Hotline (Smart/TNT)", value: "0919-057-1553" },
  { label: "NCMH Crisis Hotline (Globe/TM)", value: "0917-899-8727" },
  { label: "NCMH Crisis Hotline (alternate mobile)", value: "0966-351-4518" },
] as const;
export const EMERGENCY_NUMBER = "911";
