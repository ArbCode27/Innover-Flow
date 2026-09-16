"use client";

import { useMemo } from "react";
import type { Conversation, Label } from "../_lib/types";

export const useLabels = (labels: Label[], conversations: Conversation[]) => {
  const usage = useMemo(
    () =>
      new Map(
        labels.map((label) => [
          label.id,
          conversations.filter((conversation) =>
            conversation.label_ids.includes(label.id)
          ).length,
        ])
      ),
    [conversations, labels]
  );

  return { usage };
};
