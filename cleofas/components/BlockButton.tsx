import { blockUser, unblockUser } from "@/app/actions";
import { ActionForm } from "./ActionForm";

export function BlockButton({ userId, username, isBlocked }: { userId: string; username: string; isBlocked: boolean }) {
  if (isBlocked) {
    return (
      <ActionForm action={unblockUser} fields={{ userId }} className="btn-ghost">
        Unblock
      </ActionForm>
    );
  }
  return (
    <ActionForm
      action={blockUser}
      fields={{ userId }}
      className="btn-danger"
      confirm={`Block @${username}? You won't see each other's posts or non-anonymous replies, and any follows between you will be removed.`}
    >
      Block
    </ActionForm>
  );
}
