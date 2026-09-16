import { formatUnreadCount } from "../../_lib/conversation-inbox-utils";

interface UnreadCountBadgeProps {
  count: number;
}

export const UnreadCountBadge = ({ count }: UnreadCountBadgeProps) => {
  if (count <= 0) return null;

  return (
    <span
      className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white dark:bg-amber-400 dark:text-amber-950"
      aria-hidden="true">
      {formatUnreadCount(count)}
    </span>
  );
};
