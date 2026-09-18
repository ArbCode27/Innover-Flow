// scripts/ensure-pnpm.mjs
// Bloquea cualquier intento de instalación con npm, yarn o bun.

const userAgent = process.env.npm_config_user_agent || "";

if (!userAgent.startsWith("pnpm")) {
  console.error("\n\x1b[31m%s\x1b[0m", "╔═════════════════════════════════════════════════════════════╗");
  console.error("\x1b[31m%s\x1b[0m", "║                                                             ║");
  console.error("\x1b[31m%s\x1b[0m", "║   ERROR: Este proyecto está configurado para usar PNPM.     ║");
  console.error("\x1b[31m%s\x1b[0m", "║                                                             ║");
  console.error("\x1b[31m%s\x1b[0m", "║   Por favor usa 'pnpm' en lugar de 'npm' o 'yarn'.          ║");
  console.error("\x1b[31m%s\x1b[0m", "║   Ejemplo:                                                  ║");
  console.error("\x1b[31m%s\x1b[0m", "║     pnpm install                                            ║");
  console.error("\x1b[31m%s\x1b[0m", "║     pnpm dev                                                ║");
  console.error("\x1b[31m%s\x1b[0m", "║     pnpm db:check                                           ║");
  console.error("\x1b[31m%s\x1b[0m", "║                                                             ║");
  console.error("\x1b[31m%s\x1b[0m", "╚═════════════════════════════════════════════════════════════╝\n");
  process.exit(1);
}
