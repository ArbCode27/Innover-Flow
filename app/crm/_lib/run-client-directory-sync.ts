export type ClientDirectorySyncSummary = {
  created: number;
  updated: number;
  skipped: number;
  processed: number;
  errors: string[];
};

export type ClientDirectorySyncProgress = ClientDirectorySyncSummary & {
  provider: "wispro" | "sae";
  page: number;
  totalPages: number | null;
  done: boolean;
  message: string;
};

export const runClientDirectorySync = async (
  provider: "wispro" | "sae",
  onProgress?: (progress: ClientDirectorySyncProgress) => void,
): Promise<ClientDirectorySyncSummary> => {
  let cursor: string | null = null;
  const summary: ClientDirectorySyncSummary = {
    created: 0,
    updated: 0,
    skipped: 0,
    processed: 0,
    errors: [],
  };
  const label = provider === "wispro" ? "Wispro" : "SAE";

  for (let page = 0; page < 250; page += 1) {
    onProgress?.({
      ...summary,
      provider,
      page: page + 1,
      totalPages: null,
      done: false,
      message: `Consultando la página ${page + 1} de ${label}…`,
    });

    const response = await fetch("/api/crm/clients/directory-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, cursor }),
    });
    const payload = (await response.json()) as ClientDirectorySyncSummary & {
      ok?: boolean;
      done?: boolean;
      nextCursor?: string | null;
      page?: number;
      totalPages?: number | null;
      error?: string;
    };
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "No se pudieron importar los clientes");
    }
    summary.created += payload.created || 0;
    summary.updated += payload.updated || 0;
    summary.skipped += payload.skipped || 0;
    summary.processed += payload.processed || 0;
    for (const error of payload.errors || []) {
      if (summary.errors.length < 8) summary.errors.push(error);
    }
    const currentPage = payload.page || page + 1;
    const totalPages = payload.totalPages ?? null;
    const done = Boolean(payload.done || !payload.nextCursor);
    const pageLabel = totalPages
      ? `Página ${currentPage} de ${totalPages}`
      : `Página ${currentPage}`;
    onProgress?.({
      ...summary,
      provider,
      page: currentPage,
      totalPages,
      done,
      message: done
        ? `Listo. ${summary.created} nuevos, ${summary.updated} actualizados y ${summary.skipped} omitidos.`
        : `${pageLabel}: ${payload.created || 0} nuevos y ${payload.updated || 0} actualizados en este lote.`,
    });
    if (done) break;
    cursor = payload.nextCursor || null;
  }

  return summary;
};
