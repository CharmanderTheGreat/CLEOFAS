import { followUser, unfollowUser } from "@/app/actions";
import { ActionForm } from "./ActionForm";

export function FollowButton({ userId, isFollowing }: { userId: string; isFollowing: boolean }) {
  return (
    <ActionForm
      action={isFollowing ? unfollowUser : followUser}
      fields={{ userId }}
      className={isFollowing ? "btn-ghost" : "btn-primary"}
    >
      {isFollowing ? "Following" : "Follow"}
    </ActionForm>
  );
}
