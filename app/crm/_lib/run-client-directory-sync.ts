export type ClientDirectorySyncSummary = {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

export const runClientDirectorySync = async (
  provider: "wispro" | "sae",
): Promise<ClientDirectorySyncSummary> => {
  let cursor: string | null = null;
  const summary: ClientDirectorySyncSummary = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  for (let page = 0; page < 250; page += 1) {
    const response = await fetch("/api/crm/clients/directory-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, cursor }),
    });
    const payload = (await response.json()) as ClientDirectorySyncSummary & {
      ok?: boolean;
      done?: boolean;
      nextCursor?: string | null;
      error?: string;
    };
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "No se pudieron importar los clientes");
    }
    summary.created += payload.created || 0;
    summary.updated += payload.updated || 0;
    summary.skipped += payload.skipped || 0;
    for (const error of payload.errors || []) {
      if (summary.errors.length < 8) summary.errors.push(error);
    }
    if (payload.done || !payload.nextCursor) break;
    cursor = payload.nextCursor;
  }

  return summary;
};
