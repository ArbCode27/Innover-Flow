"use client";

import { useCallback, useState } from "react";
import type { Message } from "../_lib/types";

interface SendMessageInput {
  to: string;
  message: string;
  conversation_id: number;
  agent_id?: number;
}

interface SendMessageResponse {
  success: true;
  wa_message_id: string | null;
  message: Message;
}

interface SendVoiceNoteInput {
  to: string;
  conversation_id: number;
  agent_id: number;
  audio: Blob;
  duration_ms: number;
}

interface SendImageMessageInput {
  to: string;
  conversation_id: number;
  agent_id: number;
  image: File;
  caption?: string;
}

interface ProcessPaymentReceiptInput {
  message_id: number;
  conversation_id: number;
  agent_id: number;
}

interface ProcessPaymentReceiptResponse {
  success: true;
  alreadyProcessed: boolean;
  messageId: number;
}

interface ResendMessageInput {
  message_id: number;
  conversation_id: number;
  agent_id: number;
}

interface ResendMessageResponse {
  success: true;
  wa_message_id: string | null;
  message: Message;
}

export function useSendMessage() {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (input: SendMessageInput) => {
    setIsSending(true);
    setError(null);

    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input,
          message: input.message.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error al enviar mensaje");
      }

      return data as SendMessageResponse;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error inesperado al enviar mensaje";

      setError(message);
      throw new Error(message);
    } finally {
      setIsSending(false);
    }
  }, []);

  const sendVoiceNote = useCallback(async (input: SendVoiceNoteInput) => {
    setIsSending(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("to", input.to);
      formData.append("conversation_id", String(input.conversation_id));
      formData.append("duration_ms", String(input.duration_ms));

      formData.append("agent_id", String(input.agent_id));

      const mimeType = input.audio.type || "audio/webm";
      const extension = mimeType.includes("ogg") ? "ogg" : "webm";
      const filename = `voice-note.${extension}`;
      formData.append("audio", input.audio, filename);

      const res = await fetch("/api/whatsapp/send-audio", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error al enviar nota de voz");
      }

      return data as SendMessageResponse;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error inesperado al enviar nota de voz";
      setError(message);
      throw new Error(message);
    } finally {
      setIsSending(false);
    }
  }, []);

  const sendImageMessage = useCallback(async (input: SendImageMessageInput) => {
    setIsSending(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("to", input.to);
      formData.append("conversation_id", String(input.conversation_id));
      formData.append("agent_id", String(input.agent_id));

      const trimmedCaption = input.caption?.trim();
      if (trimmedCaption) {
        formData.append("caption", trimmedCaption);
      }

      const extension = input.image.type.includes("png")
        ? "png"
        : input.image.type.includes("webp")
          ? "webp"
          : "jpg";
      const filename = input.image.name?.trim() || `image.${extension}`;
      formData.append("image", input.image, filename);

      const res = await fetch("/api/whatsapp/send-image", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error al enviar imagen");
      }

      return data as SendMessageResponse;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error inesperado al enviar imagen";
      setError(message);
      throw new Error(message);
    } finally {
      setIsSending(false);
    }
  }, []);

  const processPaymentReceipt = useCallback(async (input: ProcessPaymentReceiptInput) => {
    setIsSending(true);
    setError(null);

    try {
      const res = await fetch("/api/crm/payments/process-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: input.message_id,
          conversationId: input.conversation_id,
          agentId: input.agent_id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "No se pudo procesar el comprobante");
      }

      return data as ProcessPaymentReceiptResponse;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error inesperado al procesar el comprobante";
      setError(message);
      throw new Error(message);
    } finally {
      setIsSending(false);
    }
  }, []);

  const resendMessage = useCallback(async (input: ResendMessageInput) => {
    setIsSending(true);
    setError(null);

    try {
      const res = await fetch("/api/whatsapp/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message_id: input.message_id,
          conversation_id: input.conversation_id,
          agent_id: input.agent_id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "No se pudo reenviar el mensaje");
      }

      return data as ResendMessageResponse;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error inesperado al reenviar el mensaje";
      setError(message);
      throw new Error(message);
    } finally {
      setIsSending(false);
    }
  }, []);

  return {
    sendMessage,
    sendVoiceNote,
    sendImageMessage,
    processPaymentReceipt,
    resendMessage,
    isSending,
    error,
  };
}
