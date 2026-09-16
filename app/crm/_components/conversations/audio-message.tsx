"use client";

import { Pause, Play } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import { CRM_FOCUS_RING } from "../../_lib/crm-theme";

interface AudioMessageProps {
  src: string;
  caption?: string;
  isOutgoing: boolean;
}

const WAVEFORM_BARS = 36;

const formatAudioTime = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "0:00";

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
};

const createWaveform = (seed: string) => {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return Array.from({ length: WAVEFORM_BARS }, (_, index) => {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    const random = hash / 0xffffffff;
    const envelope = 0.38 + 0.62 * Math.sin((index / (WAVEFORM_BARS - 1)) * Math.PI);
    return 0.22 + random * 0.78 * envelope;
  });
};

export const AudioMessage = ({ src, caption }: AudioMessageProps) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const bars = useMemo(() => createWaveform(src), [src]);
  const trimmedCaption = caption?.trim();
  const visibleCaption =
    trimmedCaption && trimmedCaption.toLowerCase() !== "audio" ? trimmedCaption : "";
  const audioLabel = trimmedCaption
    ? `Mensaje de audio: ${trimmedCaption}`
    : "Mensaje de audio";
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const remaining = duration > 0 ? Math.max(0, duration - currentTime) : 0;
  const durationLabel = duration
    ? formatAudioTime(isPlaying ? remaining : duration)
    : "--:--";

  const handleSeekTo = (nextTime: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(nextTime)) return;

    const clamped = Math.min(Math.max(nextTime, 0), duration || 0);
    audio.currentTime = clamped;
    setCurrentTime(clamped);
  };

  const handleSeekFromClientX = (
    target: HTMLElement,
    clientX: number,
  ) => {
    if (!duration) return;
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    handleSeekTo(ratio * duration);
  };

  const handleTogglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
      return;
    }

    audio.pause();
    setIsPlaying(false);
  };

  const handleLoadedMetadata = () => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    setDuration(audio.duration);
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!duration) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    handleSeekFromClientX(event.currentTarget, event.clientX);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    handleSeekFromClientX(event.currentTarget, event.clientX);
  };

  const handleWaveformKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!duration) return;
    const step = Math.max(0.4, duration / 20);

    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      handleSeekTo(currentTime + step);
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      handleSeekTo(currentTime - step);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      handleSeekTo(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      handleSeekTo(duration);
    }
  };

  const handleAudioEnded = () => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
  };

  return (
    <div className="flex w-[min(19rem,72vw)] flex-col gap-2">
      <audio
        ref={audioRef}
        className="sr-only"
        preload="metadata"
        src={src}
        onEnded={handleAudioEnded}
        onLoadedMetadata={handleLoadedMetadata}
        onDurationChange={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}>
        Tu navegador no soporta la reproducción de audio.
      </audio>

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          className={cn(
            CRM_FOCUS_RING,
            "flex size-10 shrink-0 items-center justify-center rounded-full transition",
            isPlaying
              ? "bg-white/85 text-crm-accent shadow-sm dark:bg-white/15 dark:text-crm-accent"
              : "bg-crm-accent text-crm-accent-foreground hover:bg-crm-accent-hover",
          )}
          onClick={handleTogglePlayback}
          aria-label={isPlaying ? "Pausar audio" : "Reproducir audio"}>
          {isPlaying ? (
            <Pause className="size-4" aria-hidden="true" />
          ) : (
            <Play className="ml-0.5 size-4" aria-hidden="true" />
          )}
        </button>

        <div
          role="slider"
          tabIndex={duration ? 0 : -1}
          aria-label={audioLabel}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration || 0)}
          aria-valuenow={Math.round(currentTime)}
          aria-valuetext={`${formatAudioTime(currentTime)} de ${formatAudioTime(duration)}`}
          aria-disabled={!duration}
          className={cn(
            CRM_FOCUS_RING,
            "flex h-10 min-w-0 flex-1 cursor-pointer items-center rounded-xl px-0.5",
            !duration && "cursor-default opacity-60",
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onKeyDown={handleWaveformKeyDown}>
          <div className="flex h-8 w-full items-center gap-[2px]" aria-hidden="true">
            {bars.map((height, index) => {
              const barProgress = (index + 1) / bars.length;
              const isPlayed = barProgress <= progress;

              return (
                <span
                  key={`${src}-${index}`}
                  className={cn(
                    "w-[3px] shrink-0 rounded-full transition-colors duration-150",
                    isPlayed
                      ? "bg-crm-accent"
                      : "bg-crm-accent/25 dark:bg-white/20",
                  )}
                  style={{ height: `${Math.round(height * 100)}%` }}
                />
              );
            })}
          </div>
        </div>

        <span className="shrink-0 rounded-lg bg-crm-accent/20 px-1.5 py-1 font-mono text-[11px] tabular-nums text-crm-accent-muted-foreground">
          {durationLabel}
        </span>
      </div>

      {visibleCaption ? (
        <p className="whitespace-pre-wrap break-words text-xs leading-relaxed opacity-80">
          {visibleCaption}
        </p>
      ) : null}
    </div>
  );
};
