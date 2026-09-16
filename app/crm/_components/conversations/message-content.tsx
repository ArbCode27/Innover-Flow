import { FileWarning } from "lucide-react";
import type { Message } from "../../_lib/types";
import { AudioMessage } from "./audio-message";
import { ImageMessage } from "./image-message";
import { LocationMessage } from "./location-message";
import { VideoMessage } from "./video-message";

interface MessageContentProps {
  message: Message;
  isOutgoing: boolean;
}

const TextMessage = ({ content }: Pick<Message, "content">) => (
  <p className="whitespace-pre-wrap break-words">{content}</p>
);

const UnsupportedMediaMessage = ({ content }: Pick<Message, "content">) => {
  const trimmedContent = content.trim();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs">
        <FileWarning className="size-4 shrink-0" aria-hidden="true" />
        <span>Archivo multimedia no soportado</span>
      </div>

      {trimmedContent ? <TextMessage content={trimmedContent} /> : null}
    </div>
  );
};

export const MessageContent = ({ message, isOutgoing }: MessageContentProps) => {
  const mediaUrl = message.media_url?.trim();
  const isLocationMessage = message.media_type === "location";

  if (isLocationMessage) {
    return <LocationMessage message={message} isOutgoing={isOutgoing} />;
  }

  if (!mediaUrl) {
    return <TextMessage content={message.content} />;
  }

  if (message.media_type === "audio") {
    return <AudioMessage src={mediaUrl} caption={message.content} isOutgoing={isOutgoing} />;
  }

  if (message.media_type === "image") {
    return <ImageMessage src={mediaUrl} caption={message.content} isOutgoing={isOutgoing} />;
  }

  if (message.media_type === "video") {
    return <VideoMessage src={mediaUrl} caption={message.content} isOutgoing={isOutgoing} />;
  }

  return <UnsupportedMediaMessage content={message.content} />;
};
