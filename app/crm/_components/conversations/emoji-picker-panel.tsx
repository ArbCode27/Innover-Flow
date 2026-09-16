"use client";

import { useEffect, useState, type ReactElement } from "react";
import { useTheme } from "next-themes";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import { useRecentEmojis } from "../../_hooks/use-recent-emojis";
import "./emoji-picker-panel.css";

type EmojiMartPicker = (props: Record<string, unknown>) => ReactElement | null;

type EmojiSelectPayload = {
  native?: string;
  id?: string;
};

type EmojiPickerPanelProps = {
  onEmojiSelect: (emoji: string) => void;
};

export const EmojiPickerPanel = ({ onEmojiSelect }: EmojiPickerPanelProps) => {
  const { resolvedTheme } = useTheme();
  const { recentEmojis, rememberEmoji } = useRecentEmojis();
  const [Picker, setPicker] = useState<EmojiMartPicker | null>(null);
  const [data, setData] = useState<unknown>(null);
  const [i18n, setI18n] = useState<Record<string, unknown> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const theme = resolvedTheme === "dark" ? "dark" : "light";

  useEffect(() => {
    let cancelled = false;

    const loadPicker = async () => {
      try {
        const [reactMod, dataMod, i18nMod] = await Promise.all([
          import("@emoji-mart/react"),
          import("@emoji-mart/data"),
          import("@emoji-mart/data/i18n/es.json"),
        ]);

        if (cancelled) return;

        setPicker(() => reactMod.default as EmojiMartPicker);
        setData(dataMod.default);
        setI18n(i18nMod.default as Record<string, unknown>);
      } catch (error) {
        if (cancelled) return;
        console.error("[CRM_EMOJI_PICKER] load_failed", error);
        setLoadError("No se pudo cargar el selector de emojis.");
      }
    };

    void loadPicker();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelect = (emoji: EmojiSelectPayload) => {
    const native = String(emoji?.native || "").trim();
    if (!native) return;
    rememberEmoji(native);
    onEmojiSelect(native);
  };

  return (
    <div
      className={`crm-emoji-picker overflow-hidden rounded-2xl ${CRM_SURFACES.elevated}`}
      data-theme={theme}
      role="dialog"
      aria-label="Selector de emojis">
      {recentEmojis.length > 0 ? (
        <div className={`border-b px-3 py-2 ${CRM_SURFACES.border}`}>
          <p
            className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${CRM_SURFACES.textMuted}`}>
            Recientes
          </p>
          <div className="grid grid-cols-8 gap-0.5">
            {recentEmojis.slice(0, 16).map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`flex size-9 items-center justify-center rounded-lg text-xl transition ${CRM_SURFACES.hover}`}
                aria-label={`Insertar emoji ${emoji}`}
                onMouseDown={(event) => {
                  // Keep textarea selection; avoid stealing focus before insert.
                  event.preventDefault();
                  rememberEmoji(emoji);
                  onEmojiSelect(emoji);
                }}>
                <span aria-hidden="true">{emoji}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {loadError ? (
        <p className={`px-4 py-6 text-sm ${CRM_SURFACES.textMuted}`} role="alert">
          {loadError}
        </p>
      ) : !Picker || !data || !i18n ? (
        <div
          className={`flex h-[220px] items-center justify-center text-sm ${CRM_SURFACES.textMuted}`}
          aria-live="polite">
          Cargando emojis…
        </div>
      ) : (
        <Picker
          data={data}
          i18n={i18n}
          theme={theme}
          previewPosition="none"
          skinTonePosition="search"
          navPosition="top"
          searchPosition="sticky"
          maxFrequentRows={0}
          perLine={8}
          emojiSize={26}
          emojiButtonSize={36}
          onEmojiSelect={handleSelect}
        />
      )}
    </div>
  );
};
