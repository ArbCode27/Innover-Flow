import Image from "next/image";

interface ImageMessageProps {
  src: string;
  caption?: string;
  isOutgoing: boolean;
}

const GENERIC_CAPTIONS = new Set(["imagen", "image"]);

export const ImageMessage = ({ src, caption }: ImageMessageProps) => {
  const trimmedCaption = caption?.trim();
  const visibleCaption =
    trimmedCaption && !GENERIC_CAPTIONS.has(trimmedCaption.toLowerCase())
      ? trimmedCaption
      : "";
  const altText = visibleCaption || "Imagen enviada en la conversación";

  return (
    <>
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-accent focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-[#0f1117]"
        aria-label="Abrir imagen en una pestaña nueva">
        <Image
          src={src}
          alt={altText}
          width={320}
          height={400}
          unoptimized
          className="max-h-80 w-auto max-w-[min(19rem,72vw)] rounded-2xl object-contain sm:max-w-80"
        />
      </a>

      {visibleCaption ? (
        <p
          className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed opacity-80">
          {visibleCaption}
        </p>
      ) : null}
    </>
  );
};
