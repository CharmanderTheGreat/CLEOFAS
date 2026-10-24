import { blockUser, unblockUser } from "@/app/actions";
import { ConfirmButton } from "./ConfirmButton";

export function BlockButton({ userId, username, isBlocked }: { userId: string; username: string; isBlocked: boolean }) {
  return (
    <form action={isBlocked ? unblockUser : blockUser}>
      <input type="hidden" name="userId" value={userId} />
      {isBlocked ? (
        <button type="submit" className="btn-ghost">
          Unblock
        </button>
      ) : (
        <ConfirmButton
          className="btn-danger"
          message={`Block @${username}? You won't see each other's posts or replies, and any follows between you will be removed.`}
        >
          Block
        </ConfirmButton>
      )}
    </form>
  );
}
