"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "crm:recent-emojis";
const MAX_RECENT = 24;

const readRecentEmojis = (): string[] => {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string" && item.length > 0)
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
};

const writeRecentEmojis = (emojis: string[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(emojis.slice(0, MAX_RECENT)));
  } catch {
    // Ignore quota / private mode failures.
  }
};

/**
 * Tracks recently used emoji natives for a CRM-owned "Recientes" category.
 */
export const useRecentEmojis = () => {
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);

  useEffect(() => {
    setRecentEmojis(readRecentEmojis());
  }, []);

  const rememberEmoji = useCallback((emoji: string) => {
    const native = emoji.trim();
    if (!native) return;

    setRecentEmojis((current) => {
      const next = [native, ...current.filter((item) => item !== native)].slice(
        0,
        MAX_RECENT,
      );
      writeRecentEmojis(next);
      return next;
    });
  }, []);

  return { recentEmojis, rememberEmoji };
};
