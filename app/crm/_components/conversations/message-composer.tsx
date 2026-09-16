"use client";

import {
  ChangeEvent,
  ClipboardEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { ImagePlus, Mic, Send, Smile, Square, Trash2, X } from "lucide-react";
import { CrmButton } from "../shared/crm-button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import { useVoiceRecorder } from "../../_hooks/use-voice-recorder";
import type { QuickReply } from "../../_lib/types";

const EmojiPickerPanel = dynamic(
  () =>
    import("./emoji-picker-panel").then((mod) => mod.EmojiPickerPanel),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[220px] w-[min(100vw-2rem,360px)] items-center justify-center text-sm text-slate-500">
        Cargando emojis…
      </div>
    ),
  },
);

interface MessageComposerProps {
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  quickReplies: QuickReply[];
  onSend: (content: string) => Promise<void>;
  onSendVoiceNote: (
    audioBlob: Blob,
    meta: { durationMs: number; mimeType: string },
  ) => Promise<void>;
  onSendImage: (imageFile: File, caption?: string) => Promise<void>;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const formatDuration = (durationMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const isValidImageFile = (file: File) => {
  if (!ALLOWED_IMAGE_MIME_TYPES.has((file.type || "").toLowerCase())) {
    return { valid: false, error: "Formato no soportado. Usa JPG, PNG o WEBP." };
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return { valid: false, error: "La imagen supera el límite de 5 MB." };
  }

  if (file.size <= 0) {
    return { valid: false, error: "La imagen no es válida." };
  }

  return { valid: true, error: null as string | null };
};

const extractQuickReplyContext = (text: string, cursorPosition: number) => {
  const safeCursorPosition = Math.max(0, Math.min(cursorPosition, text.length));
  const textBeforeCursor = text.slice(0, safeCursorPosition);
  const match = textBeforeCursor.match(/(?:^|\s)\/([^\s]*)$/);
  if (!match) return null;

  const triggerStart = textBeforeCursor.lastIndexOf("/");
  if (triggerStart < 0) return null;

  return {
    query: (match[1] || "").trim().toLowerCase(),
    triggerStart,
    triggerEnd: safeCursorPosition,
  };
};

export const MessageComposer = ({
  disabled,
  readOnly = false,
  placeholder = "Escribe un mensaje...",
  quickReplies,
  onSend,
  onSendVoiceNote,
  onSendImage,
}: MessageComposerProps) => {
  const [value, setValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isSendingVoice, setIsSendingVoice] = useState(false);
  const [isSendingImage, setIsSendingImage] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isQuickReplyMenuOpen, setIsQuickReplyMenuOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [quickReplyQuery, setQuickReplyQuery] = useState("");
  const [quickReplyTriggerStart, setQuickReplyTriggerStart] = useState<number | null>(null);
  const [quickReplyTriggerEnd, setQuickReplyTriggerEnd] = useState<number | null>(null);
  const [highlightedQuickReplyIndex, setHighlightedQuickReplyIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recorder = useVoiceRecorder();
  const isBusy = isSending || isSendingVoice || isSendingImage;
  const isInputLocked = disabled || isBusy || readOnly;
  const hasSendableContent = Boolean(value.trim()) || Boolean(selectedImage);
  const showSendAction = hasSendableContent;
  const isRecordingUiActive =
    recorder.status === "recording" || recorder.status === "recorded";
  const canStartRecording =
    !isInputLocked &&
    recorder.supportsRecording &&
    recorder.status !== "recording" &&
    recorder.status !== "recorded";
  const canOpenImagePicker = !isInputLocked && recorder.status !== "recording";
  const canOpenEmojiPicker =
    !isInputLocked && recorder.status !== "recording";
  const activeQuickReplies = useMemo(
    () => quickReplies.filter((quickReply) => quickReply.is_active),
    [quickReplies],
  );
  const filteredQuickReplies = useMemo(() => {
    const query = quickReplyQuery.trim().toLowerCase();
    if (!query) return activeQuickReplies;

    return activeQuickReplies.filter((quickReply) => {
      const searchableFields = [
        quickReply.shortcut,
        quickReply.title,
        quickReply.content,
        quickReply.category,
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());

      return searchableFields.some((field) => field.includes(query));
    });
  }, [activeQuickReplies, quickReplyQuery]);

  const closeQuickReplyMenu = () => {
    setIsQuickReplyMenuOpen(false);
    setQuickReplyQuery("");
    setQuickReplyTriggerStart(null);
    setQuickReplyTriggerEnd(null);
    setHighlightedQuickReplyIndex(0);
  };

  const updateQuickReplyFromText = (text: string, cursorPosition: number) => {
    if (isInputLocked || selectedImage || recorder.status === "recording") {
      closeQuickReplyMenu();
      return;
    }

    const context = extractQuickReplyContext(text, cursorPosition);
    if (!context) {
      closeQuickReplyMenu();
      return;
    }

    setIsEmojiPickerOpen(false);
    setIsQuickReplyMenuOpen(true);
    setQuickReplyQuery(context.query);
    setQuickReplyTriggerStart(context.triggerStart);
    setQuickReplyTriggerEnd(context.triggerEnd);
    setHighlightedQuickReplyIndex(0);
  };

  useEffect(() => {
    if (!selectedImage) {
      setSelectedImageUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(selectedImage);
    setSelectedImageUrl(previewUrl);

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [selectedImage]);

  useEffect(() => {
    if (!isQuickReplyMenuOpen) return;
    if (!filteredQuickReplies.length) {
      setHighlightedQuickReplyIndex(0);
      return;
    }

    setHighlightedQuickReplyIndex((current) =>
      Math.min(current, filteredQuickReplies.length - 1),
    );
  }, [filteredQuickReplies, isQuickReplyMenuOpen]);

  useEffect(() => {
    if (!isInputLocked) return;
    closeQuickReplyMenu();
    setIsEmojiPickerOpen(false);
  }, [isInputLocked]);

  const insertEmojiAtCursor = (emoji: string) => {
    if (!emoji || isInputLocked) return;

    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const nextValue = value.slice(0, start) + emoji + value.slice(end);
    const nextCursor = start + emoji.length;

    setValue(nextValue);
    setIsQuickReplyMenuOpen(false);

    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
      updateQuickReplyFromText(nextValue, nextCursor);
    });
  };

  const clearSelectedImage = () => {
    setSelectedImage(null);
    setImageError(null);
  };

  const setImageFromFile = (file: File | null) => {
    if (!file) return;

    const validation = isValidImageFile(file);
    if (!validation.valid) {
      setImageError(validation.error);
      return;
    }

    setSelectedImage(file);
    setImageError(null);
  };

  const handleSendMessage = async () => {
    if (selectedImage) {
      await handleSendImage();
      return;
    }

    const content = value.trim();
    if (!content || isInputLocked) return;

    setIsSending(true);
    try {
      await onSend(content);
      setValue("");
    } catch {
      // The parent component owns user-facing error feedback.
    } finally {
      setIsSending(false);
    }
  };

  const handleStartRecording = async () => {
    if (!canStartRecording) return;
    setIsEmojiPickerOpen(false);
    closeQuickReplyMenu();
    await recorder.startRecording();
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] || null;
    setImageFromFile(nextFile);
    event.target.value = "";
  };

  const handlePasteImage = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (isInputLocked || recorder.status === "recording") return;

    const imageItem = Array.from(event.clipboardData.items).find((item) =>
      item.type.startsWith("image/"),
    );
    if (!imageItem) return;

    const pastedFile = imageItem.getAsFile();
    if (!pastedFile) return;

    event.preventDefault();
    const extension = pastedFile.type.includes("png") ? "png" : "jpg";
    const file = new File([pastedFile], `pasted-image-${Date.now()}.${extension}`, {
      type: pastedFile.type,
    });
    setImageFromFile(file);
  };

  const handleSendVoiceNote = async () => {
    if (
      isInputLocked ||
      !recorder.audioBlob ||
      recorder.status !== "recorded"
    ) {
      return;
    }

    setIsSendingVoice(true);
    try {
      await onSendVoiceNote(recorder.audioBlob, {
        durationMs: recorder.durationMs,
        mimeType: recorder.audioBlob.type || recorder.selectedMimeType || "audio/webm",
      });
      recorder.discardRecording();
    } catch {
      // The parent component owns user-facing error feedback.
    } finally {
      setIsSendingVoice(false);
    }
  };

  const handleSendImage = async () => {
    if (isInputLocked || !selectedImage) return;

    setIsSendingImage(true);
    try {
      await onSendImage(selectedImage, value.trim() || undefined);
      setValue("");
      clearSelectedImage();
    } catch {
      // The parent component owns user-facing error feedback.
    } finally {
      setIsSendingImage(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (readOnly) return;

    if (isQuickReplyMenuOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!filteredQuickReplies.length) return;
        setHighlightedQuickReplyIndex((current) =>
          (current + 1) % filteredQuickReplies.length,
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!filteredQuickReplies.length) return;
        setHighlightedQuickReplyIndex((current) =>
          current === 0 ? filteredQuickReplies.length - 1 : current - 1,
        );
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeQuickReplyMenu();
        return;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        if (!filteredQuickReplies.length) return;
        event.preventDefault();
        const selectedQuickReply = filteredQuickReplies[highlightedQuickReplyIndex];
        if (selectedQuickReply) {
          handleSelectQuickReply(selectedQuickReply);
        }
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const handleSelectQuickReply = (quickReply: QuickReply) => {
    if (quickReplyTriggerStart === null || quickReplyTriggerEnd === null) {
      closeQuickReplyMenu();
      return;
    }

    const replacementContent = quickReply.content.trim();
    const nextValue =
      value.slice(0, quickReplyTriggerStart) +
      replacementContent +
      value.slice(quickReplyTriggerEnd);
    const nextCursorPosition = quickReplyTriggerStart + replacementContent.length;

    setValue(nextValue);
    closeQuickReplyMenu();

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursorPosition, nextCursorPosition);
    });
  };

  const handleChangeText = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    setValue(nextValue);
    updateQuickReplyFromText(nextValue, event.target.selectionStart ?? nextValue.length);
  };

  const handleUpdateQuickReplyCursor = (target: HTMLTextAreaElement) => {
    updateQuickReplyFromText(target.value, target.selectionStart ?? target.value.length);
  };

  return (
    <div className={`shrink-0 border-t p-4 ${CRM_SURFACES.border} ${CRM_SURFACES.elevatedTranslucent}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        onChange={handleFileInputChange}
        className="hidden"
        aria-hidden="true"
      />

      {selectedImage && selectedImageUrl ? (
        <div className={`mb-3 rounded-2xl border p-3 ${CRM_SURFACES.border} ${CRM_SURFACES.input}`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className={`text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
              Imagen lista para enviar
            </p>
            <CrmButton
              type="button"
              variant="secondary"
              className="h-8 px-3"
              onClick={clearSelectedImage}
              disabled={isBusy}
              aria-label="Quitar imagen adjunta">
              <X className="size-3.5" aria-hidden="true" />
              Quitar
            </CrmButton>
          </div>
          <img
            src={selectedImageUrl}
            alt="Vista previa de imagen adjunta"
            className={`max-h-64 w-auto max-w-full rounded-2xl border object-contain ${CRM_SURFACES.border}`}
          />
          <p className={`mt-2 text-xs ${CRM_SURFACES.textMuted}`}>
            Agrega un mensaje opcional como pie de foto.
          </p>
        </div>
      ) : null}

      {recorder.status === "recording" ? (
        <div
          className={`mb-3 rounded-2xl border px-3 py-2 ${CRM_SURFACES.border} ${CRM_SURFACES.input}`}
          role="status"
          aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <p className={`text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
              Grabando nota de voz... {formatDuration(recorder.durationMs)}
            </p>
            <div className="flex items-center gap-2">
              <CrmButton
                type="button"
                variant="secondary"
                className="h-8 px-3"
                onClick={recorder.discardRecording}
                disabled={isInputLocked}
                aria-label="Cancelar grabación">
                Cancelar
              </CrmButton>
              <CrmButton
                type="button"
                variant="destructive"
                className="h-8 px-3"
                onClick={recorder.stopRecording}
                disabled={isInputLocked}
                aria-label="Detener grabación">
                <Square className="size-3.5" aria-hidden="true" />
                Detener
              </CrmButton>
            </div>
          </div>
        </div>
      ) : null}

      {recorder.status === "recorded" && recorder.audioUrl ? (
        <div className={`mb-3 rounded-2xl border p-3 ${CRM_SURFACES.border} ${CRM_SURFACES.input}`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className={`text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
              Nota lista ({formatDuration(recorder.durationMs)})
            </p>
            <div className="flex items-center gap-2">
              <CrmButton
                type="button"
                variant="secondary"
                className="h-8 px-3"
                onClick={recorder.discardRecording}
                disabled={isBusy}
                aria-label="Descartar nota de voz">
                <Trash2 className="size-3.5" aria-hidden="true" />
                Descartar
              </CrmButton>
              <CrmButton
                type="button"
                className="h-8 px-3"
                onClick={handleSendVoiceNote}
                disabled={isBusy}
                aria-label={isSendingVoice ? "Enviando nota de voz" : "Enviar nota de voz"}>
                {isSendingVoice ? (
                  <Spinner className="size-4 text-white" aria-hidden="true" />
                ) : (
                  <Send className="size-4" aria-hidden="true" />
                )}
                Enviar audio
              </CrmButton>
            </div>
          </div>
          <audio
            src={recorder.audioUrl}
            controls
            preload="metadata"
            className="w-full"
            aria-label="Vista previa de nota de voz"
          />
        </div>
      ) : null}

      {recorder.error && recorder.status !== "unsupported" ? (
        <p className="mb-2 text-xs text-rose-500" role="alert">
          {recorder.error}
        </p>
      ) : null}
      {imageError ? (
        <p className="mb-2 text-xs text-rose-500" role="alert">
          {imageError}
        </p>
      ) : null}

      {isQuickReplyMenuOpen ? (
        <div className={`mb-2 rounded-2xl border ${CRM_SURFACES.border} ${CRM_SURFACES.elevated}`}>
          <div className={`border-b px-3 py-2 text-xs font-medium ${CRM_SURFACES.border} ${CRM_SURFACES.textMuted}`}>
            Respuestas rápidas {quickReplyQuery ? `para "/${quickReplyQuery}"` : ""}
          </div>
          <div
            role="listbox"
            aria-label="Listado de respuestas rápidas"
            className="crm-scrollbar max-h-60 overflow-y-auto p-1">
            {filteredQuickReplies.length ? (
              filteredQuickReplies.map((quickReply, index) => (
                <button
                  key={quickReply.id}
                  type="button"
                  role="option"
                  aria-selected={index === highlightedQuickReplyIndex}
                  className={`flex w-full flex-col rounded-lg px-3 py-2 text-left transition ${
                    index === highlightedQuickReplyIndex
                      ? "bg-crm-accent-muted text-crm-accent-muted-foreground"
                      : `${CRM_SURFACES.hover} ${CRM_SURFACES.textSecondary}`
                  }`}
                  onMouseEnter={() => setHighlightedQuickReplyIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    handleSelectQuickReply(quickReply);
                  }}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{quickReply.title}</span>
                    {quickReply.shortcut ? (
                      <span className="rounded bg-crm-accent/10 px-1.5 py-0.5 text-[11px] font-semibold text-crm-accent">
                        /{quickReply.shortcut}
                      </span>
                    ) : null}
                  </div>
                  <p className="line-clamp-2 text-xs opacity-80">{quickReply.content}</p>
                </button>
              ))
            ) : (
              <p className={`px-3 py-4 text-xs ${CRM_SURFACES.textMuted}`}>
                No hay respuestas rápidas para esa búsqueda.
              </p>
            )}
          </div>
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <CrmButton
          type="button"
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={!canOpenImagePicker}
          className="size-11 rounded-full p-0"
          aria-label="Adjuntar imagen">
          <ImagePlus className="size-4" aria-hidden="true" />
        </CrmButton>
        <Popover
          open={isEmojiPickerOpen}
          onOpenChange={(open) => {
            if (open && !canOpenEmojiPicker) return;
            if (open) closeQuickReplyMenu();
            setIsEmojiPickerOpen(open);
          }}>
          <PopoverTrigger asChild>
            <CrmButton
              type="button"
              variant="secondary"
              disabled={!canOpenEmojiPicker}
              className="size-11 rounded-full p-0"
              aria-label="Insertar emoji"
              aria-expanded={isEmojiPickerOpen}
              aria-haspopup="dialog">
              <Smile className="size-4" aria-hidden="true" />
            </CrmButton>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="start"
            sideOffset={10}
            className={cn(
              "w-auto border p-0 shadow-lg",
              CRM_SURFACES.border,
              CRM_SURFACES.elevated,
            )}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              textareaRef.current?.focus();
            }}
            onEscapeKeyDown={() => {
              textareaRef.current?.focus();
            }}>
            {isEmojiPickerOpen ? (
              <EmojiPickerPanel onEmojiSelect={insertEmojiAtCursor} />
            ) : null}
          </PopoverContent>
        </Popover>
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleChangeText}
          onKeyDown={handleKeyDown}
          onKeyUp={(event) => handleUpdateQuickReplyCursor(event.currentTarget)}
          onClick={(event) => handleUpdateQuickReplyCursor(event.currentTarget)}
          onSelect={(event) => handleUpdateQuickReplyCursor(event.currentTarget)}
          onPaste={handlePasteImage}
          readOnly={readOnly}
          disabled={disabled || isBusy || recorder.status === "recording"}
          placeholder={
            selectedImage ? "Escribe un pie de foto (opcional)..." : placeholder
          }
          className={cn(
            "min-h-11 max-h-28 resize-none rounded-3xl focus-visible:ring-crm-accent md:max-h-32",
            CRM_SURFACES.border,
            readOnly
              ? `${CRM_SURFACES.inputReadonly} ${CRM_SURFACES.textMuted} cursor-not-allowed`
              : CRM_SURFACES.input,
            CRM_SURFACES.textPrimary,
            CRM_SURFACES.placeholder,
          )}
          aria-label="Mensaje"
          aria-readonly={readOnly}
        />
        {/* WhatsApp-style: one trailing action — Mic when empty, Send when content. */}
        <CrmButton
          type="button"
          variant={showSendAction ? "primary" : "secondary"}
          onClick={showSendAction ? handleSendMessage : handleStartRecording}
          disabled={
            showSendAction
              ? isInputLocked || !hasSendableContent
              : !canStartRecording || isRecordingUiActive
          }
          className="size-11 rounded-full p-0 transition-colors duration-150"
          aria-label={
            showSendAction
              ? isSendingImage
                ? "Enviando imagen"
                : isSending
                  ? "Enviando mensaje"
                  : selectedImage
                    ? "Enviar imagen"
                    : "Enviar mensaje"
              : "Grabar nota de voz"
          }>
          {isSending || isSendingImage ? (
            <Spinner className="size-4 text-white" aria-hidden="true" />
          ) : showSendAction ? (
            <Send className="size-4 transition-opacity duration-150" aria-hidden="true" />
          ) : (
            <Mic className="size-4 transition-opacity duration-150" aria-hidden="true" />
          )}
        </CrmButton>
      </div>
      {!recorder.supportsRecording ? (
        <p className={`mt-2 text-xs ${CRM_SURFACES.textMuted}`}>
          Tu navegador no soporta grabación de notas de voz.
        </p>
      ) : null}
    </div>
  );
};
