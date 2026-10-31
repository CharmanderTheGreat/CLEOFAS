import { VenetianMask } from "lucide-react";
import { avatarUrl } from "@/lib/avatar";

type Props = {
  username?: string | null;
  path?: string | null;
  size?: number;
  // Anonymous posts and replies always show the mask, never a picture or a letter.
  anonymous?: boolean;
  className?: string;
};

// Profile picture, or the first letter of the username on a soft color when there is none.
export function Avatar({ username, path, size = 36, anonymous = false, className = "" }: Props) {
  const base = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`;
  const box = { width: size, height: size };

  if (anonymous || !username) {
    return (
      <span aria-hidden className={`${base} bg-chip text-muted`} style={box}>
        <VenetianMask size={Math.round(size * 0.55)} />
      </span>
    );
  }

  const url = avatarUrl(path);
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} loading="lazy" decoding="async" className={`${base} object-cover`} style={box} />;
  }

  let hash = 0;
  for (const char of username) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return (
    <span
      aria-hidden
      className={`${base} bg-[hsl(var(--h)_38%_84%)] font-semibold text-[hsl(var(--h)_45%_24%)] dark:bg-[hsl(var(--h)_26%_26%)] dark:text-[hsl(var(--h)_50%_86%)]`}
      style={{ ...box, fontSize: Math.round(size * 0.42), ["--h" as string]: hash }}
    >
      {username[0].toUpperCase()}
    </span>
  );
}
