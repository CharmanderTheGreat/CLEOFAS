import { followUser, unfollowUser } from "@/app/actions";

export function FollowButton({ userId, isFollowing }: { userId: string; isFollowing: boolean }) {
  return (
    <form action={isFollowing ? unfollowUser : followUser}>
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" className={isFollowing ? "btn-ghost" : "btn-primary"}>
        {isFollowing ? "Following" : "Follow"}
      </button>
    </form>
  );
}
