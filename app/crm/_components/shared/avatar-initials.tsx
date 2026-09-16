import type { CSSProperties } from "react";
import { getInitials } from "../../_lib/formatters";

interface AvatarInitialsProps {
  name: string;
  initials?: string | null;
  color?: string | null;
  bg?: string | null;
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: "size-7 text-[10px]",
  md: "size-9 text-xs",
  lg: "size-11 text-sm",
};

export const AvatarInitials = ({
  name,
  initials,
  color = "#4f8ef7",
  bg = "rgba(79,142,247,.15)",
  size = "md",
}: AvatarInitialsProps) => (
  <div
    className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${sizes[size]}`}
    style={{ color: color || "#4f8ef7", backgroundColor: bg || "rgba(79,142,247,.15)" } as CSSProperties}
    aria-hidden="true"
  >
    {initials || getInitials(name)}
  </div>
);
