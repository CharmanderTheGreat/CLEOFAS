export const MAX_POST_LENGTH = 1000;
export const MAX_REPLY_LENGTH = 500;
export const MAX_BIO_LENGTH = 160;
export const MAX_DISPLAY_NAME_LENGTH = 50;
export const MAX_REPORT_REASON_LENGTH = 500;
export const FEED_PAGE_SIZE = 20;

// Age gate shown at onboarding (PROJECT.md section 11). Change to 18 if you want the stricter option.
export const MIN_AGE = 13;

export const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;
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
