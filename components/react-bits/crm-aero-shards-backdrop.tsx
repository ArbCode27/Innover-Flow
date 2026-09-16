"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { AeroShards } from "./aero-shards";

export const CrmAeroShardsBackdrop = () => {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(true);

  useEffect(() => {
    setMounted(true);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setPrefersReducedMotion(media.matches);
    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  if (!mounted || prefersReducedMotion) return null;

  const isDark = resolvedTheme === "dark";

  return (
    <AeroShards
      className="absolute inset-0"
      backgroundColor={isDark ? "#16131c" : "#eef3f8"}
      shardColor={isDark ? "#8b7bb8" : "#9aa8c8"}
      accentColor={isDark ? "#c4b5fd" : "#7c8ec4"}
      placement="full"
      flow="stream"
      material="pearl"
      detail="balanced"
      density={1}
      speed={0.7}
      glow={0.85}
      bloom={0.35}
      interaction="repel"
      onError={() => undefined}
    />
  );
};
