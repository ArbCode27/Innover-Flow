import type { Conversation, Message } from "./types";

export const getUnreadCount = (conversation: Conversation) =>
  conversation.unread ?? 0;

export const formatUnreadCount = (count: number) =>
  count > 99 ? "99+" : String(count);

export const hasUnreadMessages = (conversation: Conversation) =>
  getUnreadCount(conversation) > 0;

export const getConversationActivityTimestamp = (conversation: Conversation) =>
  conversation.last_message_at ??
  conversation.updated_at ??
  conversation.created_at ??
  "";

export const sortConversationsForInbox = (conversations: Conversation[]) =>
  [...conversations].sort((left, right) => {
    const unreadDiff =
      Number(hasUnreadMessages(right)) - Number(hasUnreadMessages(left));

    if (unreadDiff !== 0) return unreadDiff;

    return getConversationActivityTimestamp(right).localeCompare(
      getConversationActivityTimestamp(left),
    );
  });

export const applyInboundMessageToConversation = (
  conversation: Conversation,
  message: Pick<Message, "type" | "content" | "created_at">,
  options: { incrementUnread?: boolean } = {},
) => {
  if (message.type !== "in") return conversation;

  const activityAt = message.created_at ?? new Date().toISOString();
  const shouldIncrementUnread = options.incrementUnread ?? false;

  return {
    ...conversation,
    preview: message.content,
    updated_at: activityAt,
    last_message_at: activityAt,
    unread: shouldIncrementUnread
      ? (conversation.unread ?? 0) + 1
      : conversation.unread,
  };
};
