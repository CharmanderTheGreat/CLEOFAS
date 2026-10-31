"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { removeAvatar, updateAvatar } from "@/app/actions";
import { cooldownEnds, formatCooldown } from "@/lib/avatar";
import { AVATAR_SIZE, COOLDOWN_DAYS } from "@/lib/constants";
import { Avatar } from "./Avatar";
import { ActionForm } from "./ActionForm";

// Crops to a centered square and shrinks to 256 px. This also removes hidden photo data (like location).
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas");
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close();

  const toBlob = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  const blob = (await toBlob("image/webp", 0.85)) ?? (await toBlob("image/jpeg", 0.85));
  if (!blob) throw new Error("no blob");
  return blob;
}

export function AvatarUploader({
  username,
  avatarPath,
  changedAt,
}: {
  username: string;
  avatarPath: string | null;
  changedAt: string | null;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error?: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const lockedUntil = cooldownEnds(changedAt);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setMessage(null);
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMessage({ error: true, text: "Please use a JPG, PNG or WebP picture." });
      return;
    }
    try {
      const shrunk = await shrink(file);
      if (preview) URL.revokeObjectURL(preview);
      setBlob(shrunk);
      setPreview(URL.createObjectURL(shrunk));
    } catch {
      setMessage({ error: true, text: "Couldn't read that picture. Try another one." });
    }
  }

  function save() {
    if (!blob) return;
    const formData = new FormData();
    formData.set("avatar", new File([blob], "avatar", { type: blob.type }));
    startTransition(async () => {
      const result = await updateAvatar(formData);
      if (result?.error) {
        setMessage({ error: true, text: result.error });
        return;
      }
      setBlob(null);
      setPreview(null);
      if (input.current) input.current.value = "";
      setMessage({ text: "Picture updated." });
      router.refresh();
    });
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-4">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="New profile picture preview" width={72} height={72} className="h-[72px] w-[72px] rounded-full object-cover" />
        ) : (
          <Avatar username={username} path={avatarPath} size={72} />
        )}

        <div className="space-y-2">
          <input ref={input} id="avatar" type="file" accept="image/jpeg,image/png,image/webp" onChange={onPick} className="sr-only" disabled={lockedUntil !== null || pending} />
          <div className="flex flex-wrap gap-2">
            <label
              htmlFor="avatar"
              className={`btn-ghost cursor-pointer gap-1.5 ${lockedUntil ? "pointer-events-none opacity-50" : ""}`}
            >
              <Camera size={16} aria-hidden /> {avatarPath ? "Change picture" : "Add picture"}
            </label>
            {blob && (
              <button type="button" onClick={save} disabled={pending} className="btn-primary">
                {pending ? "Saving…" : "Save picture"}
              </button>
            )}
            {avatarPath && !blob && !lockedUntil && (
              <ActionForm
                action={removeAvatar}
                fields={{}}
                className="btn-ghost"
                pendingLabel="Removing…"
                confirm="Remove your picture? You can only change it again after 7 days."
              >
                Remove
              </ActionForm>
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted">
        {lockedUntil
          ? `You can change your picture again on ${formatCooldown(lockedUntil)}.`
          : `Optional. Without one, the first letter of your username is shown. You can change it once every ${COOLDOWN_DAYS} days. Anonymous posts and replies never show your picture.`}
      </p>
      {message && (
        <p role={message.error ? "alert" : undefined} className={`text-sm ${message.error ? "text-danger" : "text-muted"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
