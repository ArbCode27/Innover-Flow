"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type VoiceRecorderStatus =
  | "idle"
  | "recording"
  | "recorded"
  | "unsupported"
  | "permission-denied"
  | "error";

interface UseVoiceRecorderOptions {
  maxDurationMs?: number;
}

const SUPPORTED_MIME_TYPES = [
  "audio/ogg;codecs=opus",
  "audio/webm;codecs=opus",
  "audio/webm",
] as const;

const RECORDING_TICK_MS = 250;
const DEFAULT_MAX_DURATION_MS = 5 * 60 * 1000;

const getBestMimeType = () => {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return null;
  }

  for (const mimeType of SUPPORTED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  return null;
};

export const useVoiceRecorder = (options: UseVoiceRecorderOptions = {}) => {
  const maxDurationMs = options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
  const [status, setStatus] = useState<VoiceRecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<number | null>(null);
  const maxDurationTimeoutRef = useRef<number | null>(null);
  const selectedMimeType = useMemo(() => getBestMimeType(), []);

  const supportsRecording = useMemo(() => {
    if (typeof window === "undefined") return false;

    return Boolean(
      selectedMimeType &&
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === "function" &&
        typeof MediaRecorder !== "undefined",
    );
  }, [selectedMimeType]);

  const clearTimers = useCallback(() => {
    if (durationIntervalRef.current) {
      window.clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    if (maxDurationTimeoutRef.current) {
      window.clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }
  }, []);

  const stopMediaTracks = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const resetRecording = useCallback(() => {
    clearTimers();

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }

    mediaRecorderRef.current = null;
    chunksRef.current = [];
    startedAtRef.current = null;

    setAudioBlob(null);
    setAudioUrl(null);
    setDurationMs(0);
    setError(null);
    setStatus(supportsRecording ? "idle" : "unsupported");
  }, [audioUrl, clearTimers, supportsRecording]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;

    recorder.stop();
  }, []);

  const discardRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    }

    stopMediaTracks();
    resetRecording();
  }, [resetRecording, stopMediaTracks]);

  const startRecording = useCallback(async () => {
    if (!supportsRecording || !selectedMimeType) {
      setStatus("unsupported");
      setError("Este navegador no soporta notas de voz");
      return;
    }

    if (mediaRecorderRef.current?.state === "recording") return;

    try {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }

      setAudioBlob(null);
      setAudioUrl(null);
      setError(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          noiseSuppression: true,
          echoCancellation: true,
        },
      });

      mediaStreamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
      });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        clearTimers();
        stopMediaTracks();

        const blob = new Blob(chunksRef.current, {
          type: selectedMimeType,
        });
        chunksRef.current = [];

        if (blob.size === 0) {
          setStatus("error");
          setError("No se pudo capturar audio. Intenta grabar nuevamente");
          return;
        }

        const nextUrl = URL.createObjectURL(blob);
        const startedAt = startedAtRef.current ?? Date.now();
        const elapsed = Date.now() - startedAt;

        setAudioBlob(blob);
        setAudioUrl(nextUrl);
        setDurationMs(elapsed);
        setStatus("recorded");
      };

      recorder.onerror = () => {
        clearTimers();
        stopMediaTracks();
        setStatus("error");
        setError("Ocurrió un error al grabar el audio");
      };

      startedAtRef.current = Date.now();
      setDurationMs(0);
      setStatus("recording");
      recorder.start();

      durationIntervalRef.current = window.setInterval(() => {
        const startedAt = startedAtRef.current;
        if (!startedAt) return;
        setDurationMs(Date.now() - startedAt);
      }, RECORDING_TICK_MS);

      maxDurationTimeoutRef.current = window.setTimeout(() => {
        stopRecording();
      }, maxDurationMs);
    } catch (recordError) {
      clearTimers();
      stopMediaTracks();

      if (recordError instanceof DOMException && recordError.name === "NotAllowedError") {
        setStatus("permission-denied");
        setError("Permite el uso del micrófono para enviar notas de voz");
        return;
      }

      setStatus("error");
      setError("No se pudo iniciar la grabación");
    }
  }, [
    audioUrl,
    clearTimers,
    maxDurationMs,
    selectedMimeType,
    stopMediaTracks,
    stopRecording,
    supportsRecording,
  ]);

  useEffect(() => {
    if (!supportsRecording) {
      setStatus("unsupported");
      setError("Este navegador no soporta notas de voz");
    }
  }, [supportsRecording]);

  useEffect(
    () => () => {
      clearTimers();
      stopMediaTracks();
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    },
    [audioUrl, clearTimers, stopMediaTracks],
  );

  return {
    supportsRecording,
    status,
    error,
    durationMs,
    audioBlob,
    audioUrl,
    maxDurationMs,
    selectedMimeType,
    startRecording,
    stopRecording,
    discardRecording,
  };
};
